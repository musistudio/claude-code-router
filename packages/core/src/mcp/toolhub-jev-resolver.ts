const defaultTypeSafeEndpoint = "https://api.typesafe.ai/v1/systemone";
const maxChoiceToolCount = 254;
const retryableStatuses = new Set([429, 500, 502, 503, 504, 529]);

export type JevCatalogItem = {
  description: string;
  inputSchema?: Record<string, unknown>;
  serverLabel?: string;
  serverName: string;
  tags: string[];
  title: string;
  toolName: string;
};

export type JevResolveResult = {
  anyToolProbability: number;
  noMatch: boolean;
  selectedToolNames: string[];
  summary: string;
};

type TypeSafeAnswer = {
  choice?: string;
  confidence?: number;
  noul?: number;
  probabilities?: Record<string, number>;
  type?: string;
};

type TypeSafeResponse = {
  answers?: Record<string, TypeSafeAnswer>;
  model?: string;
};

type RankedCandidate = {
  choiceProbability: number;
  index: number;
  tool: JevCatalogItem;
};

export class ToolHubJevResolver {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fitThreshold: number;
  private readonly gateThreshold: number;
  private readonly maxRetries: number;
  private readonly model: string;
  private readonly shortlistSize: number;

  constructor(options: {
    apiKey?: string;
    endpoint?: string;
    fitThreshold?: number;
    gateThreshold?: number;
    maxRetries?: number;
    model?: string;
    shortlistSize?: number;
  } = {}) {
    this.apiKey = options.apiKey?.trim() || env("TOOLHUB_TYPESAFE_API_KEY") || env("TYPESAFE_API_KEY");
    this.endpoint = options.endpoint?.trim() || env("TOOLHUB_TYPESAFE_ENDPOINT") || env("TYPESAFE_ENDPOINT") || defaultTypeSafeEndpoint;
    this.fitThreshold = probability(options.fitThreshold ?? envNumber("TOOLHUB_TYPESAFE_FIT_THRESHOLD", 0.75), 0.75);
    this.gateThreshold = probability(options.gateThreshold ?? envNumber("TOOLHUB_TYPESAFE_GATE_THRESHOLD", 0.65), 0.65);
    this.maxRetries = normalizeInteger(options.maxRetries, 2, 0, 5);
    this.model = options.model?.trim() || env("TOOLHUB_TYPESAFE_MODEL") || env("TYPESAFE_MODEL") || "jev-latest";
    this.shortlistSize = normalizeInteger(options.shortlistSize ?? envNumber("TOOLHUB_TYPESAFE_SHORTLIST_SIZE", 16), 16, 1, 64);
  }

  async resolve(input: {
    catalog: JevCatalogItem[];
    context?: Record<string, unknown>;
    maxTools: number;
    observations?: Array<{ resultSummary: string; toolName: string }>;
    task: string;
    timeoutMs: number;
  }): Promise<JevResolveResult> {
    const task = input.task.trim();
    if (!task) {
      throw new Error("ToolHub resolve query must be non-empty.");
    }
    if (!this.apiKey) {
      throw new Error("ToolHub Jev resolver requires TOOLHUB_TYPESAFE_API_KEY or TYPESAFE_API_KEY.");
    }
    if (input.catalog.length === 0) {
      return this.noMatchResult(0);
    }

    const deadlineAt = Date.now() + normalizeInteger(input.timeoutMs, 60_000, 100, 300_000);
    const chunks = chunk(input.catalog, maxChoiceToolCount);
    const wideResults = await Promise.all(chunks.map((catalogChunk, chunkIndex) => this.evaluateWide({
      catalog: catalogChunk,
      context: input.context,
      deadlineAt,
      indexOffset: chunkIndex * maxChoiceToolCount,
      observations: input.observations,
      task
    })));
    const anyToolProbability = Math.max(...wideResults.map((result) => result.anyToolProbability));
    if (anyToolProbability < this.gateThreshold) {
      return this.noMatchResult(anyToolProbability);
    }

    const ranked = wideResults
      .flatMap((result) => result.ranked)
      .sort((left, right) => right.choiceProbability - left.choiceProbability || left.index - right.index)
      .slice(0, Math.min(this.shortlistSize, input.catalog.length));
    const narrow = await this.evaluate({
      deadlineAt,
      questions: Object.fromEntries(ranked.map((_, index) => [
        candidateId(index),
        {
          type: "noul",
          instructions: [
            `Is \`tools[${index}]\` required in a reasonable complete workflow for \`task\`?`,
            "Answer yes only if this exact operation is needed, not merely related or potentially useful.",
            "Judge it independently: more than one tool may be required."
          ].join(" ")
        }
      ])),
      state: {
        context: input.context ?? {},
        observations: input.observations ?? [],
        task,
        tools: ranked.map((candidate) => toStateTool(candidate.tool))
      }
    });
    const selected = ranked
      .map((candidate, index) => ({
        ...candidate,
        requiredProbability: requireNoul(narrow.answers?.[candidateId(index)], candidateId(index)).noul as number
      }))
      .filter((candidate) => candidate.requiredProbability >= this.fitThreshold)
      .sort((left, right) =>
        right.requiredProbability - left.requiredProbability ||
        right.choiceProbability - left.choiceProbability ||
        left.index - right.index
      )
      .slice(0, input.maxTools);

    if (selected.length === 0) {
      return this.noMatchResult(anyToolProbability);
    }
    const selectedToolNames = selected.map((candidate) => candidate.tool.toolName);
    return {
      anyToolProbability,
      noMatch: false,
      selectedToolNames,
      summary: `Jev selected ${selectedToolNames.length} tool${selectedToolNames.length === 1 ? "" : "s"} using calibrated gate ${this.gateThreshold} and fit ${this.fitThreshold}.`
    };
  }

  private async evaluateWide(input: {
    catalog: JevCatalogItem[];
    context?: Record<string, unknown>;
    deadlineAt: number;
    indexOffset: number;
    observations?: Array<{ resultSummary: string; toolName: string }>;
    task: string;
  }): Promise<{ anyToolProbability: number; ranked: RankedCandidate[] }> {
    const response = await this.evaluate({
      deadlineAt: input.deadlineAt,
      questions: {
        primary_tool: {
          type: "choice",
          instructions: [
            "Choose the single available tool that is most directly necessary for a reasonable complete workflow for `task`.",
            "Choose `none` when the request can be answered without these tools or none materially helps.",
            "Do not choose a merely related tool."
          ].join(" "),
          criteria: {
            ...Object.fromEntries(input.catalog.map((tool, index) => [
              candidateId(index),
              `Use \`tools[${index}]\`, ${tool.toolName}: ${tool.description}`
            ])),
            none: "No available tool materially helps complete the user's request."
          }
        },
        any_tool: {
          type: "noul",
          instructions: [
            "Would at least one tool in `tools` materially help complete `task`?",
            "Answer no when the user explicitly says not to use tools or the request only needs reasoning, writing, or general knowledge."
          ].join(" ")
        }
      },
      state: {
        context: input.context ?? {},
        observations: input.observations ?? [],
        task: input.task,
        tools: input.catalog.map(toStateTool)
      }
    });
    const primary = requireChoice(response.answers?.primary_tool, "primary_tool");
    const anyTool = requireNoul(response.answers?.any_tool, "any_tool");
    return {
      anyToolProbability: anyTool.noul as number,
      ranked: input.catalog
        .map((tool, index) => ({
          choiceProbability: numberOrZero(primary.probabilities?.[candidateId(index)]),
          index: input.indexOffset + index,
          tool
        }))
        .sort((left, right) => right.choiceProbability - left.choiceProbability || left.index - right.index)
        .slice(0, Math.min(this.shortlistSize, input.catalog.length))
    };
  }

  private async evaluate(input: {
    deadlineAt: number;
    questions: Record<string, unknown>;
    state: Record<string, unknown>;
  }): Promise<TypeSafeResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const remainingMs = input.deadlineAt - Date.now();
      if (remainingMs <= 0) {
        throw lastError ?? new Error("ToolHub Jev resolver exceeded its latency budget.");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remainingMs);
      try {
        const response = await fetch(this.endpoint, {
          body: JSON.stringify({
            model: this.model,
            questions: input.questions,
            state: input.state
          }),
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json"
          },
          method: "POST",
          signal: controller.signal
        });
        const bodyText = await response.text();
        const body = parseJson(bodyText);
        if (!response.ok) {
          const error = new Error(`TypeSafe returned HTTP ${response.status}: ${summarizeBody(body ?? bodyText)}`);
          if (attempt < this.maxRetries && retryableStatuses.has(response.status)) {
            lastError = error;
            await delayWithinDeadline(250 * (2 ** attempt), input.deadlineAt);
            continue;
          }
          throw error;
        }
        if (!isRecord(body) || !isRecord(body.answers)) {
          throw new Error("TypeSafe response is missing an answers object.");
        }
        return body as TypeSafeResponse;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries && isRetryableNetworkError(error)) {
          await delayWithinDeadline(250 * (2 ** attempt), input.deadlineAt);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error("TypeSafe request failed.");
  }

  private noMatchResult(anyToolProbability: number): JevResolveResult {
    return {
      anyToolProbability,
      noMatch: true,
      selectedToolNames: [],
      summary: `Jev found no configured MCP tool above the calibrated gate ${this.gateThreshold} and fit ${this.fitThreshold}.`
    };
  }
}

function toStateTool(tool: JevCatalogItem): Record<string, unknown> {
  return {
    description: tool.description,
    name: tool.toolName,
    requiredArguments: Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [],
    server: tool.serverLabel || tool.serverName,
    tags: tool.tags,
    title: tool.title
  };
}

function candidateId(index: number): string {
  return `t${index}`;
}

function requireChoice(value: TypeSafeAnswer | undefined, id: string): Required<Pick<TypeSafeAnswer, "choice" | "probabilities">> & TypeSafeAnswer {
  if (value?.type !== "choice" || typeof value.choice !== "string" || !isRecord(value.probabilities)) {
    throw new Error(`TypeSafe answer ${id} is not a valid Choice.`);
  }
  return value as Required<Pick<TypeSafeAnswer, "choice" | "probabilities">> & TypeSafeAnswer;
}

function requireNoul(value: TypeSafeAnswer | undefined, id: string): Required<Pick<TypeSafeAnswer, "noul">> & TypeSafeAnswer {
  if (value?.type !== "noul" || !Number.isFinite(value.noul)) {
    throw new Error(`TypeSafe answer ${id} is not a valid Noul.`);
  }
  return value as Required<Pick<TypeSafeAnswer, "noul">> & TypeSafeAnswer;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function summarizeBody(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function isRetryableNetworkError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
}

async function delayWithinDeadline(delayMs: number, deadlineAt: number): Promise<void> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, remainingMs)));
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

function probability(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : fallback;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
