import DOMPurify from "dompurify";
import { marked } from "marked";

type BenchmarkMethodId = "full-inner-html" | "full-fragment-replace" | "block-fragment-tail";

type BenchmarkScenario = {
  id: string;
  label: string;
  markdown: string;
  step: number;
};

type BenchmarkResult = {
  childCount: number;
  markdownLength: number;
  method: BenchmarkMethodId;
  msPerPatch: number;
  patchCount: number;
  scenario: string;
  totalMs: number;
};

type BenchmarkSummary = {
  environment: string;
  repetitions: number;
  results: BenchmarkResult[];
  winners: Array<{
    ratioToWinner: Record<BenchmarkMethodId, number>;
    scenario: string;
    winner: BenchmarkMethodId;
  }>;
};

type BenchmarkOptions = {
  repetitions?: number;
};

type BenchmarkWindow = Window & {
  __runMarkdownBenchmarks?: (options?: BenchmarkOptions) => Promise<BenchmarkSummary>;
};

const root = document.getElementById("benchmark-root");

if (!root) {
  throw new Error("Benchmark root not found");
}

marked.use({
  async: false,
  breaks: false,
  gfm: true,
  pedantic: false
});

root.innerHTML = `
  <section class="benchmark-shell">
    <h1>Markdown Rendering Benchmark</h1>
    <p>Run <code>window.__runMarkdownBenchmarks()</code> from the browser console.</p>
    <pre id="benchmark-output">Idle</pre>
    <div id="benchmark-viewport">
      <div id="benchmark-target" class="markdown-stream-panel"></div>
    </div>
  </section>
`;

const output = document.getElementById("benchmark-output") as HTMLPreElement;
const viewport = document.getElementById("benchmark-viewport") as HTMLDivElement;
const target = document.getElementById("benchmark-target") as HTMLDivElement;

const style = document.createElement("style");
style.textContent = `
  body {
    margin: 0;
    background: #f7f8f8;
    color: #20242a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .benchmark-shell {
    display: grid;
    grid-template-rows: auto auto minmax(160px, 1fr) minmax(320px, 62vh);
    gap: 12px;
    min-height: 100vh;
    padding: 24px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
  }

  p {
    margin: 0;
  }

  #benchmark-output {
    overflow: auto;
    margin: 0;
    border: 1px solid #dce1e4;
    border-radius: 8px;
    background: #10151d;
    color: #d8e2ee;
    font-size: 12px;
    line-height: 1.5;
    padding: 12px;
    white-space: pre-wrap;
  }

  #benchmark-viewport {
    overflow: auto;
    border: 1px solid #dce1e4;
    border-radius: 8px;
    background: #ffffff;
    padding: 20px;
  }

  .markdown-stream-panel > * + *,
  .markdown-tail > * + * {
    margin-top: 1rem;
  }

  .markdown-stream-panel > .markdown-tail:empty {
    display: none;
  }

  .markdown-stream-panel h1,
  .markdown-stream-panel h2,
  .markdown-stream-panel h3 {
    margin: 0;
    line-height: 1.2;
  }

  .markdown-stream-panel p,
  .markdown-stream-panel li,
  .markdown-stream-panel blockquote {
    font-size: 15px;
    line-height: 1.72;
  }

  .markdown-stream-panel pre {
    overflow-x: auto;
    border-radius: 8px;
    background: #10151d;
    color: #d8e2ee;
    padding: 12px;
  }

  .markdown-stream-panel table {
    width: 100%;
    border-collapse: collapse;
  }

  .markdown-stream-panel th,
  .markdown-stream-panel td {
    border-top: 1px solid #e7ecef;
    padding: 7px 9px;
    text-align: left;
  }

  .benchmark-cursor {
    display: inline-block;
    width: 7px;
    height: 1em;
    background: #0f766e;
  }
`;
document.head.appendChild(style);

const methods: Array<{
  id: BenchmarkMethodId;
  run: (markdown: string, indices: number[]) => BenchmarkResult;
}> = [
  {
    id: "full-inner-html",
    run: runFullInnerHtml
  },
  {
    id: "full-fragment-replace",
    run: runFullFragmentReplace
  },
  {
    id: "block-fragment-tail",
    run: runBlockFragmentTail
  }
];

async function runMarkdownBenchmarks(options: BenchmarkOptions = {}) {
  const repetitions = options.repetitions ?? 4;
  const scenarios = createScenarios();
  const results: BenchmarkResult[] = [];

  delete output.dataset.summary;
  output.dataset.done = "false";
  output.textContent = "Running...";

  for (const scenario of scenarios) {
    const indices = createPatchIndices(scenario.markdown.length, scenario.step);
    for (const method of methods) {
      const samples: BenchmarkResult[] = [];
      method.run(scenario.markdown, indices);
      await nextFrame();

      for (let iteration = 0; iteration < repetitions; iteration += 1) {
        await nextFrame();
        samples.push(method.run(scenario.markdown, indices));
      }

      const medianSample = medianBy(samples, (sample) => sample.totalMs);
      results.push({
        ...medianSample,
        method: method.id,
        scenario: scenario.label
      });
      output.textContent = formatSummary(buildSummary(results, repetitions));
    }
  }

  const summary = buildSummary(results, repetitions);
  output.textContent = formatSummary(summary);
  output.dataset.done = "true";
  output.dataset.summary = JSON.stringify(summary);
  return summary;
}

function runFullInnerHtml(markdown: string, indices: number[]): BenchmarkResult {
  target.replaceChildren();
  const startedAt = performance.now();

  for (const index of indices) {
    const final = index >= markdown.length;
    target.innerHTML = `${renderHtml(markdown.slice(0, index))}${final ? "" : '<span class="benchmark-cursor"></span>'}`;
    viewport.scrollTop = viewport.scrollHeight;
  }

  return createResult("full-inner-html", markdown, indices, performance.now() - startedAt);
}

function runFullFragmentReplace(markdown: string, indices: number[]): BenchmarkResult {
  target.replaceChildren();
  const startedAt = performance.now();

  for (const index of indices) {
    const final = index >= markdown.length;
    const fragment = renderFragment(markdown.slice(0, index));
    if (!final) fragment.append(createCursor());
    target.replaceChildren(fragment);
    viewport.scrollTop = viewport.scrollHeight;
  }

  return createResult("full-fragment-replace", markdown, indices, performance.now() - startedAt);
}

function runBlockFragmentTail(markdown: string, indices: number[]): BenchmarkResult {
  target.replaceChildren();

  const tail = document.createElement("div");
  tail.className = "markdown-tail";
  const cursor = createCursor();
  target.replaceChildren(tail, cursor);

  let committedIndex = 0;
  let previousTail = "";
  const startedAt = performance.now();

  for (const index of indices) {
    const final = index >= markdown.length;
    const commitBoundary = final ? markdown.length : findStableCommitBoundary(markdown, committedIndex, index);

    if (commitBoundary > committedIndex) {
      target.insertBefore(renderFragment(markdown.slice(committedIndex, commitBoundary)), tail);
      committedIndex = commitBoundary;
      previousTail = "";
    }

    const tailMarkdown = markdown.slice(committedIndex, index);
    if (tailMarkdown !== previousTail) {
      tail.replaceChildren(renderFragment(tailMarkdown));
      previousTail = tailMarkdown;
    }

    if (final) {
      tail.remove();
      cursor.remove();
    }

    viewport.scrollTop = viewport.scrollHeight;
  }

  return createResult("block-fragment-tail", markdown, indices, performance.now() - startedAt);
}

function renderHtml(markdown: string) {
  return DOMPurify.sanitize(marked.parse(markdown) as string, {
    ADD_ATTR: ["target", "rel"],
    USE_PROFILES: { html: true }
  });
}

function renderFragment(markdown: string) {
  const html = marked.parse(markdown) as string;
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true }
  }) as unknown as DocumentFragment;
}

function createCursor() {
  const cursor = document.createElement("span");
  cursor.className = "benchmark-cursor";
  cursor.setAttribute("aria-hidden", "true");
  return cursor;
}

function createResult(method: BenchmarkMethodId, markdown: string, indices: number[], totalMs: number): BenchmarkResult {
  return {
    childCount: target.children.length,
    markdownLength: markdown.length,
    method,
    msPerPatch: totalMs / indices.length,
    patchCount: indices.length,
    scenario: "",
    totalMs
  };
}

function createPatchIndices(length: number, step: number) {
  const indices: number[] = [];
  for (let index = step; index < length; index += step) {
    indices.push(index);
  }
  if (indices[indices.length - 1] !== length) indices.push(length);
  return indices;
}

function createScenarios(): BenchmarkScenario[] {
  return [
    {
      id: "short",
      label: "short mixed markdown",
      markdown: createMarkdownFixture(6),
      step: 48
    },
    {
      id: "medium",
      label: "medium mixed markdown",
      markdown: createMarkdownFixture(28),
      step: 96
    },
    {
      id: "long",
      label: "long mixed markdown",
      markdown: createMarkdownFixture(110),
      step: 160
    },
    {
      id: "code-heavy",
      label: "code and table heavy",
      markdown: createCodeHeavyFixture(64),
      step: 128
    }
  ];
}

function createMarkdownFixture(sections: number) {
  const chunks: string[] = ["# 流式 Markdown 性能测试\n"];

  for (let index = 0; index < sections; index += 1) {
    chunks.push(`
## Section ${index + 1}

这是一段用于模拟 LLM 回复的 Markdown 文本。它包含 **加粗内容**、\`inlineCode\`、列表、表格和代码块，用来让解析与 DOM 更新都接近真实聊天场景。

- 第一条说明当前 section 的业务含义。
- 第二条包含一个较长的句子，模拟模型连续输出时的自然语言段落。
- 第三条包含 \`requestAnimationFrame\`、\`DocumentFragment\` 和 \`replaceChildren\`。

| metric | value | note |
| --- | --- | --- |
| section | ${index + 1} | mixed |
| patch | ${index * 7 + 3} | deterministic |

\`\`\`ts
function renderSection${index}(value: string) {
  return value.trim().toUpperCase();
}
\`\`\`

> 完成的 block 应该被冻结，后续 patch 只更新 tail。
`);
  }

  return chunks.join("\n");
}

function createCodeHeavyFixture(sections: number) {
  const chunks: string[] = ["# Code Heavy Stream\n"];

  for (let index = 0; index < sections; index += 1) {
    chunks.push(`
### Patch Group ${index + 1}

\`\`\`tsx
const row${index} = Array.from({ length: 8 }, (_, column) => ({
  id: \`${index}-\${column}\`,
  label: "streaming markdown benchmark",
  active: column % 2 === 0
}));
\`\`\`

| column | parse | dom | layout |
| --- | ---: | ---: | ---: |
| ${index} | ${index * 3 + 1} | ${index * 5 + 2} | ${index * 7 + 3} |
| ${index + 1} | ${index * 3 + 4} | ${index * 5 + 6} | ${index * 7 + 8} |
`);
  }

  return chunks.join("\n");
}

function findStableCommitBoundary(markdown: string, startIndex: number, visibleIndex: number) {
  let cursor = startIndex;
  let stableBoundary = startIndex;
  let inFence = false;

  while (cursor < visibleIndex) {
    const nextLineBreak = markdown.indexOf("\n", cursor);
    if (nextLineBreak < 0 || nextLineBreak >= visibleIndex) break;

    const lineEnd = nextLineBreak + 1;
    const line = markdown.slice(cursor, nextLineBreak).trim();
    const fenceLine = line.startsWith("```");

    if (fenceLine) {
      inFence = !inFence;
      if (!inFence) stableBoundary = lineEnd;
    } else if (!inFence && isStableBlockLine(line)) {
      stableBoundary = lineEnd;
    }

    cursor = lineEnd;
  }

  return stableBoundary;
}

function isStableBlockLine(line: string) {
  if (!line) return true;
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) return true;
  return false;
}

function buildSummary(results: BenchmarkResult[], repetitions: number): BenchmarkSummary {
  const scenarios = [...new Set(results.map((result) => result.scenario))];

  return {
    environment: navigator.userAgent,
    repetitions,
    results,
    winners: scenarios.map((scenario) => {
      const scenarioResults = results.filter((result) => result.scenario === scenario);
      const winner = scenarioResults.reduce((best, result) => (result.totalMs < best.totalMs ? result : best), scenarioResults[0]);
      const ratioToWinner = Object.fromEntries(
        scenarioResults.map((result) => [result.method, result.totalMs / winner.totalMs])
      ) as Record<BenchmarkMethodId, number>;

      return {
        ratioToWinner,
        scenario,
        winner: winner.method
      };
    })
  };
}

function formatSummary(summary: BenchmarkSummary) {
  return JSON.stringify(
    {
      repetitions: summary.repetitions,
      results: summary.results.map((result) => ({
        scenario: result.scenario,
        method: result.method,
        totalMs: Number(result.totalMs.toFixed(2)),
        msPerPatch: Number(result.msPerPatch.toFixed(3)),
        patchCount: result.patchCount,
        markdownLength: result.markdownLength,
        childCount: result.childCount
      })),
      winners: summary.winners.map((winner) => ({
        scenario: winner.scenario,
        winner: winner.winner,
        ratioToWinner: Object.fromEntries(
          Object.entries(winner.ratioToWinner).map(([method, ratio]) => [method, Number(ratio.toFixed(2))])
        )
      }))
    },
    null,
    2
  );
}

function medianBy<T>(items: T[], selector: (item: T) => number) {
  const sorted = [...items].sort((first, second) => selector(first) - selector(second));
  return sorted[Math.floor(sorted.length / 2)];
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

(window as BenchmarkWindow).__runMarkdownBenchmarks = runMarkdownBenchmarks;

const params = new URLSearchParams(window.location.search);
if (params.has("autorun")) {
  const repetitions = Number(params.get("repetitions") ?? 4);
  window.setTimeout(() => {
    void runMarkdownBenchmarks({
      repetitions: Number.isFinite(repetitions) && repetitions > 0 ? repetitions : 4
    });
  }, 100);
}
