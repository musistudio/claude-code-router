// Pure helpers shared by the model catalog generator: provider canonicalization and
// the limit merge that turns every source record into one catalog `limits` object.
// Kept dependency free so it can be unit tested without running the generator.

const support1MContextThreshold = 1_000_000;

const numericLimitKeys = [
  "contextTokens",
  "inputTokens",
  "maxAudioLengthHours",
  "maxAudioPerPrompt",
  "maxDocumentChunksPerQuery",
  "maxImagesPerPrompt",
  "maxPdfSizeMB",
  "maxQueryTokens",
  "maxTokens",
  "maxTokensPerDocumentChunk",
  "maxVideoLength",
  "maxVideosPerPrompt",
  "outputTokens",
  "outputVectorSize"
];

// Resellers routinely republish the context window as a completion limit, and these are
// the only limits the router forwards to clients as an explicit max_tokens, so they are
// merged from the model author's records instead of from every record.
const completionLimitKeys = new Set(["maxTokens", "outputTokens"]);

const firstPartyProviderAliases = new Map(Object.entries({
  ai21: "ai21",
  alibaba: "alibaba",
  anthropic: "anthropic",
  amazon: "amazon",
  bedrock: "amazon",
  cohere: "cohere",
  deepseek: "deepseek",
  "deepseek-ai": "deepseek",
  gemini: "google",
  google: "google",
  "google-vertex": "google",
  llama: "meta-llama",
  meta: "meta-llama",
  "meta-llama": "meta-llama",
  "meta-llama3": "meta-llama",
  mistral: "mistral",
  mistralai: "mistral",
  minimax: "minimax",
  minimaxai: "minimax",
  moonshot: "moonshotai",
  moonshotai: "moonshotai",
  openai: "openai",
  perplexity: "perplexity",
  qwen: "alibaba",
  xai: "x-ai",
  "x-ai": "x-ai",
  zai: "z-ai",
  "z-ai": "z-ai",
  "zai-org": "z-ai",
  zhipuai: "z-ai"
}));

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readNumber(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function compactObject(object) {
  if (!isRecord(object)) return undefined;
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    output[key] = value;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

export function canonicalKnownProvider(value) {
  const normalized = normalizeProviderToken(value);
  return firstPartyProviderAliases.get(normalized);
}

export function canonicalProviderToken(value) {
  const normalized = normalizeProviderToken(value);
  return firstPartyProviderAliases.get(normalized) || normalized || undefined;
}

function normalizeProviderToken(value) {
  return String(value || "")
    .trim()
    .replace(/^hf:/i, "")
    .replace(/^@/, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

// Merges the limit records of one catalog entry into the single `limits` object that
// ships in models.json. `ownerProvider` is the canonical provider of the entry (the
// model author), `records` are the source records feeding it.
export function mergeLimits(records, ownerProvider) {
  const output = {};

  for (const key of numericLimitKeys) {
    const values = completionLimitKeys.has(key)
      ? authoritativeLimitValues(records, ownerProvider, key)
      : records.map((record) => readNumber(record?.limits?.[key])).filter((value) => value !== undefined);
    if (values.length > 0) output[key] = Math.max(...values);
  }

  const contextCandidates = [output.contextTokens, output.inputTokens, output.maxTokens]
    .filter((value) => Number.isFinite(value));
  output.supports1MContext = contextCandidates.some((value) => value >= support1MContextThreshold);

  return compactObject(output);
}

// Completion limits are the only limits the router forwards to clients as an explicit
// max_tokens, and it uses the larger of the two (`Math.max(maxTokens, outputTokens)`).
// Resellers routinely republish the context window as a completion limit, so a maximum
// over every source record can hand clients a request size the model author rejects.
//
// The authority decision is made once per entry and covers both completion keys: when
// the owning provider publishes a positive `outputTokens` or `maxTokens`, each key is
// the maximum over the author's own records and a key the author does not publish is
// omitted (a reseller never fills it). Otherwise — the entry has no record from its
// author, or the author publishes no completion limit — both keys keep the previous
// behaviour of merging every record.
function authoritativeLimitValues(records, ownerProvider, key) {
  const owner = canonicalProviderToken(ownerProvider);
  const authorRecords = owner
    ? records.filter((record) => canonicalProviderToken(record?.provider) === owner)
    : [];

  if (publishesCompletionLimit(authorRecords)) {
    return authorRecords
      .map((record) => readNumber(record?.limits?.[key]))
      .filter((value) => value !== undefined && value > 0);
  }

  return records
    .map((record) => readNumber(record?.limits?.[key]))
    .filter((value) => value !== undefined);
}

function publishesCompletionLimit(records) {
  return records.some((record) => Array.from(completionLimitKeys).some((key) => {
    const value = readNumber(record?.limits?.[key]);
    return value !== undefined && value > 0;
  }));
}
