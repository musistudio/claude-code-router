import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputFile = path.join(projectRoot, "packages", "ui", "src", "generated", "claude-code-config-options.json");

const sources = {
  envEn: "https://code.claude.com/docs/en/env-vars.md",
  envZh: "https://code.claude.com/docs/zh-CN/env-vars.md",
  settingsEn: "https://code.claude.com/docs/en/settings-reference.md",
  settingsZh: "https://code.claude.com/docs/zh-CN/settings.md"
};

const excludedSettingKeys = new Set([
  "env"
]);

const generatedBy = "scripts/generate-claude-code-config-options.mjs";

async function main() {
  let previous;
  try {
    previous = JSON.parse(readFileSync(outputFile, "utf8"));
  } catch {
    previous = undefined;
  }

  try {
    const docs = await fetchDocs(sources);
    const settingsEn = parseSettingsReference(docs.settingsEn, "en");
    const settingsZh = parseSettingsReference(docs.settingsZh, "zh");
    const envEn = parseEnvReference(docs.envEn);
    const envZh = parseEnvReference(docs.envZh);
    const generated = {
      generatedAt: new Date().toISOString(),
      generatedBy,
      sourceUrls: sources,
      settings: mergeLocalizedSettings(settingsEn, settingsZh),
      env: mergeLocalizedEnv(envEn, envZh)
    };
    writeJsonIfChanged(outputFile, generated);
    console.log(`[claude-config] Generated ${generated.settings.length} settings and ${generated.env.length} environment variables from official Claude Code docs.`);
  } catch (error) {
    if (previous?.settings?.length || previous?.env?.length) {
      console.warn(`[claude-config] Failed to refresh official Claude Code docs; reusing existing metadata. ${formatError(error)}`);
      return;
    }
    throw error;
  }
}

async function fetchDocs(urls) {
  const entries = await Promise.all(Object.entries(urls).map(async ([key, url]) => {
    const response = await fetch(url, {
      headers: {
        "accept": "text/markdown,text/plain,*/*",
        "user-agent": "claude-code-router-build"
      }
    });
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return [key, await response.text()];
  }));
  return Object.fromEntries(entries);
}

function parseSettingsReference(markdown, locale) {
  const globalConfigIndex = markdown.indexOf("\n## Global config settings");
  const scopedMarkdown = globalConfigIndex > 0 ? markdown.slice(0, globalConfigIndex) : markdown;
  const sections = markdownSections(scopedMarkdown, /^### `([^`]+)`/gm);
  if (sections.length > 0) {
    return sections
      .map((section) => settingFromSection(section, locale))
      .filter((option) => option && !excludedSettingKeys.has(option.key));
  }
  return settingOptionsFromTables(scopedMarkdown)
    .filter((option) => !excludedSettingKeys.has(option.key));
}

function settingFromSection(section, locale) {
  const key = section.title.trim();
  if (!key || key.includes(" ")) {
    return undefined;
  }
  const scope = firstMetadataValue(section.body, locale === "zh" ? "作用域" : "Scope");
  const type = firstMetadataValue(section.body, locale === "zh" ? "类型" : "Type");
  const defaultValue = firstMetadataValue(section.body, locale === "zh" ? "默认值" : "Default");
  const example = firstCodeBlock(section.body, "json");
  return {
    key,
    path: key.split("."),
    scope,
    type,
    default: defaultValue,
    example,
    valueKind: inferValueKind(type, example),
    enumValues: enumValuesFromSection(section.body),
    description: cleanDescription(firstDescription(section.body))
  };
}

function parseEnvReference(markdown) {
  const variablesIndex = markdown.indexOf("\n## Variables");
  const scopedMarkdown = variablesIndex > 0 ? markdown.slice(variablesIndex) : markdown;
  const sections = markdownSections(scopedMarkdown, /^### `([^`]+)`/gm);
  if (sections.length > 0) {
    return sections
      .map((section) => envFromSection(section))
      .filter(Boolean);
  }
  return envFromTables(scopedMarkdown);
}

function settingOptionsFromTables(markdown) {
  const options = [];
  for (const table of markdownTables(markdown)) {
    const headers = table.headers.map((item) => stripMarkdown(item).toLowerCase());
    const keyIndex = headers.findIndex((item) => item.includes("key") || item.includes("键"));
    const descriptionIndex = headers.findIndex((item) => item.includes("description") || item.includes("描述"));
    const exampleIndex = headers.findIndex((item) => item.includes("example") || item.includes("示例"));
    if (keyIndex < 0 || descriptionIndex < 0) {
      continue;
    }
    for (const row of table.rows) {
      const key = firstBacktickValue(row[keyIndex]) || stripMarkdown(row[keyIndex]).trim();
      if (!key || key.includes(" ")) {
        continue;
      }
      const example = exampleIndex >= 0 ? cleanInline(row[exampleIndex]) : "";
      options.push({
        key,
        path: key.split("."),
        scope: "",
        type: "",
        default: "",
        example,
        valueKind: inferValueKind("", example),
        enumValues: enumValuesFromSection(row[descriptionIndex]),
        description: cleanDescription(row[descriptionIndex])
      });
    }
  }
  return options;
}

function envFromSection(section) {
  const key = section.title.trim();
  if (!isEnvName(key)) {
    return undefined;
  }
  const example = firstEnvExample(section.body, key) || placeholderForEnvName(key);
  return {
    key,
    description: cleanDescription(firstDescription(section.body)),
    example,
    valueKind: inferEnvValueKind(key, section.body, example)
  };
}

function envFromTables(markdown) {
  const rows = [];
  for (const table of markdownTables(markdown)) {
    const headers = table.headers.map((item) => item.toLowerCase());
    const keyIndex = headers.findIndex((item) => item.includes("variable") || item.includes("变量"));
    const purposeIndex = headers.findIndex((item) => item.includes("purpose") || item.includes("description") || item.includes("用途") || item.includes("目的") || item.includes("描述"));
    if (keyIndex < 0 || purposeIndex < 0) {
      continue;
    }
    for (const row of table.rows) {
      const key = stripMarkdown(row[keyIndex]).trim();
      if (!isEnvName(key)) {
        continue;
      }
      const description = cleanDescription(row[purposeIndex]);
      const valueKind = inferEnvValueKind(key, description, "");
      rows.push({
        key,
        description,
        example: envExampleFromTableCell(key, row[purposeIndex], valueKind),
        valueKind
      });
    }
  }
  return rows;
}

function mergeLocalizedSettings(enOptions, zhOptions) {
  const zhByKey = new Map(zhOptions.map((item) => [item.key, item]));
  return enOptions
    .map((option) => {
      const zh = zhByKey.get(option.key);
      return {
        key: option.key,
        path: option.path,
        scope: option.scope,
        type: option.type,
        default: option.default,
        example: option.example || zh?.example || placeholderForKind(option.valueKind),
        valueKind: option.valueKind,
        enumValues: option.enumValues.length ? option.enumValues : zh?.enumValues ?? [],
        description: {
          en: option.description,
          zh: zh?.description || option.description
        }
      };
    })
    .filter((option) => isConfigurableSettingsOption(option))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function mergeLocalizedEnv(enOptions, zhOptions) {
  const zhByKey = new Map(zhOptions.map((item) => [item.key, item]));
  return uniqueByKey(enOptions)
    .map((option) => {
      const zh = zhByKey.get(option.key);
      return {
        key: option.key,
        example: option.example || zh?.example || placeholderForEnvName(option.key),
        valueKind: option.valueKind,
        description: {
          en: option.description,
          zh: zh?.description || option.description
        }
      };
    })
    .filter((option) => isEnvName(option.key) && option.description.en)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function isConfigurableSettingsOption(option) {
  if (!option.description.en) {
    return false;
  }
  if (option.scope && /^global config$/i.test(stripMarkdown(option.scope))) {
    return false;
  }
  return true;
}

function markdownSections(markdown, headingPattern) {
  const matches = [...markdown.matchAll(headingPattern)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return {
      title: match[1],
      body: markdown.slice(match.index + match[0].length, next?.index ?? markdown.length)
    };
  });
}

function markdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!isTableSeparator(lines[index + 1] || "") || !lines[index].includes("|")) {
      continue;
    }
    const headers = splitMarkdownTableRow(lines[index]);
    const rows = [];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      rows.push(splitMarkdownTableRow(lines[index]));
      index += 1;
    }
    tables.push({ headers, rows });
  }
  return tables;
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;
  let code = false;
  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "`") {
      code = !code;
      current += char;
      continue;
    }
    if (char === "|" && !code) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function firstMetadataValue(markdown, label) {
  const escaped = escapeRegExp(label);
  const pattern = new RegExp(`^\\s*\\*\\s*\\*\\*${escaped}\\*\\*:\\s*(.+)$`, "im");
  return cleanInline(markdown.match(pattern)?.[1] || "");
}

function firstDescription(markdown) {
  const withoutImports = markdown
    .replace(/^\s*import\s+.*$/gm, "")
    .replace(/^\s*<Warning>[\s\S]*?<\/Warning>\s*/m, "")
    .trimStart();
  const lines = withoutImports.split(/\r?\n/);
  const paragraph = [];
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (
      trimmed.startsWith("* **") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("<") ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("}") ||
      trimmed.startsWith("#### ") ||
      trimmed.startsWith("### ") ||
      trimmed.startsWith("## ")
    ) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    paragraph.push(trimmed);
  }
  return paragraph.join(" ");
}

function firstCodeBlock(markdown, lang) {
  const pattern = new RegExp("```" + lang + "[^\\n]*\\n([\\s\\S]*?)```", "i");
  const code = markdown.match(pattern)?.[1]?.trim();
  return code ? stripCommonIndent(code) : "";
}

function firstEnvExample(markdown, key) {
  const examples = [];
  const codePattern = /```(?:bash|json|powershell|batch|text)?[^\n]*\n([\s\S]*?)```/gi;
  for (const match of markdown.matchAll(codePattern)) {
    examples.push(match[1]);
  }
  const assignmentPattern = new RegExp(`${escapeRegExp(key)}\\s*[:=]\\s*[\"']?([^\"'\\n,}]+)`, "i");
  for (const example of examples) {
    const value = example.match(assignmentPattern)?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return firstBacktickValue(markdown);
}

function firstBacktickValue(markdown) {
  const match = markdown.match(/`([^`\n]+)`/);
  return match?.[1]?.trim() || "";
}

function envExampleFromTableCell(key, markdown, valueKind) {
  const assignmentPattern = new RegExp(`${escapeRegExp(key)}\\s*[:=]\\s*["']?([^"'\\s,}]+)`, "i");
  const assignment = markdown.match(assignmentPattern)?.[1]?.trim();
  if (assignment) {
    return assignment;
  }

  for (const value of backtickValues(markdown)) {
    const assignedValue = value.match(assignmentPattern)?.[1]?.trim();
    if (assignedValue) {
      return assignedValue;
    }
    if (valueKind === "boolean-string" && /^(?:0|1|true|false)$/i.test(value)) {
      return value;
    }
    if (valueKind === "number-string" && /^\d+$/.test(value)) {
      return value;
    }
    if ((key.includes("BASE_URL") || key.includes("ENDPOINT") || key.includes("URL")) && /^https?:\/\//i.test(value)) {
      return value;
    }
    if (key.includes("MODEL") && /^claude-/i.test(value)) {
      return value;
    }
    if (key.includes("REGION") && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(value)) {
      return value;
    }
  }

  return placeholderForEnvName(key);
}

function backtickValues(markdown) {
  return [...String(markdown || "").matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function enumValuesFromSection(markdown) {
  const values = [];
  const seen = new Set();
  const enumIntro = /one of|valid values|accepts|有效值|可选值|以下值/i;
  if (!enumIntro.test(markdown)) {
    return values;
  }
  for (const match of markdown.matchAll(/^\s*[*-]\s*`"([^"`]+)"`/gm)) {
    const value = match[1].trim();
    if (!seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function inferValueKind(type, example) {
  const normalized = stripMarkdown(type).toLowerCase();
  if (normalized.includes("boolean")) {
    return "boolean";
  }
  if (normalized.includes("integer")) {
    return "integer";
  }
  if (normalized.includes("number") || normalized.includes("float")) {
    return "number";
  }
  if (normalized.includes("array")) {
    return "array";
  }
  if (normalized.includes("object") || normalized.includes("dictionary") || normalized.includes("map")) {
    return "object";
  }
  const parsed = parseJsonExampleValue(example);
  if (Array.isArray(parsed)) {
    return "array";
  }
  if (parsed && typeof parsed === "object") {
    return "object";
  }
  if (typeof parsed === "boolean") {
    return "boolean";
  }
  if (typeof parsed === "number") {
    return Number.isInteger(parsed) ? "integer" : "number";
  }
  return "string";
}

function inferEnvValueKind(key, description, example) {
  const text = `${key} ${description} ${example}`.toLowerCase();
  if (
    /\b(?:1|true)\b.*\b(?:0|false)\b/.test(text) ||
    /\b(?:0|false)\b.*\b(?:1|true)\b/.test(text) ||
    /\bset to\s+(?:1|0|true|false)\b/.test(text) ||
    /设置为\s*(?:1|0|true|false)\b/.test(text)
  ) {
    return "boolean-string";
  }
  if (text.includes("milliseconds") || text.includes("tokens") || text.includes("timeout") || /^MAX_/.test(key) || key.endsWith("_MS")) {
    return "number-string";
  }
  return "string";
}

function parseJsonExampleValue(example) {
  if (!example) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(example);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed);
      return entries.length === 1 ? entries[0][1] : parsed;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function placeholderForKind(kind) {
  if (kind === "boolean") {
    return "true";
  }
  if (kind === "integer") {
    return "300000";
  }
  if (kind === "number") {
    return "0.05";
  }
  if (kind === "array") {
    return "[]";
  }
  if (kind === "object") {
    return "{}";
  }
  return "value";
}

function placeholderForEnvName(key) {
  if (key.includes("API_KEY") || key.includes("AUTH_TOKEN")) {
    return "sk-...";
  }
  if (key.includes("BASE_URL") || key.includes("ENDPOINT") || key.includes("URL")) {
    return "https://example.com";
  }
  if (key.endsWith("_MS") || key.includes("TIMEOUT") || key.includes("TOKENS") || key.includes("RETRIES")) {
    return "300000";
  }
  if (key.includes("DISABLE") || key.includes("ENABLE") || key.includes("SKIP") || key.includes("USE_")) {
    return "1";
  }
  if (key.includes("MODEL")) {
    return "claude-sonnet-4-6";
  }
  if (key.includes("REGION")) {
    return "us-east-1";
  }
  return "value";
}

function cleanDescription(value) {
  return cleanInline(value)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInline(value) {
  return stripMarkdown(value)
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");
}

function stripCommonIndent(value) {
  const lines = value.replace(/\s+$/g, "").split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return indent > 0 ? lines.map((line) => line.slice(indent)).join("\n") : lines.join("\n");
}

function uniqueByKey(options) {
  const seen = new Set();
  return options.filter((option) => {
    if (seen.has(option.key)) {
      return false;
    }
    seen.add(option.key);
    return true;
  });
}

function isEnvName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function writeJsonIfChanged(file, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  let previous = "";
  try {
    previous = readFileSync(file, "utf8");
  } catch {
    previous = "";
  }
  if (previous === content) {
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

await main();
