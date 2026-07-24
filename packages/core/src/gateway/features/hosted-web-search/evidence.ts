import { randomBytes } from "node:crypto";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import type { BrowserWebSearchProtocolRecord, BrowserWebSearchProtocolResult } from "@ccr/core/gateway/internal/shared";
import { uniqueStrings } from "@ccr/core/gateway/internal/collections";
import { sseEventFromValue } from "@ccr/core/gateway/features/hosted-web-search/sse";
import type { ParsedSseEvent } from "@ccr/core/gateway/features/hosted-web-search/sse";



export function queryMatchScore(queryHint: string | undefined, query: string): number {
  if (!queryHint) {
    return 0;
  }
  const left = normalizeSearchComparisonText(queryHint);
  const right = normalizeSearchComparisonText(query);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 4;
  }
  if (left.includes(right) || right.includes(left)) {
    return 3;
  }
  const leftTerms = new Set(left.split(" ").filter((item) => item.length > 2));
  const rightTerms = right.split(" ").filter((item) => item.length > 2);
  return rightTerms.reduce((score, term) => score + (leftTerms.has(term) ? 1 : 0), 0);
}



export function normalizeSearchComparisonText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}



export function responseValueContainsAnthropicWebSearchBlocks(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    const type = isRecord(block) ? stringValue(block.type) : undefined;
    return type === "server_tool_use" || type === "web_search_tool_result";
  });
}



export function responseValueContainsVisibleText(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    if (!isRecord(block) || stringValue(block.type) !== "text") {
      return false;
    }
    return Boolean(stringValue(block.text)?.trim());
  });
}



export function responseValueContainsAnthropicClientToolUse(value: Record<string, unknown>): boolean {
  return Array.isArray(value.content) && value.content.some((block) => {
    return isRecord(block) && stringValue(block.type) === "tool_use";
  });
}



function leadingThinkingBlockCount(content: unknown[]): number {
  let index = 0;
  while (index < content.length) {
    const block = content[index];
    if (!isRecord(block) || stringValue(block.type) !== "thinking") {
      break;
    }
    index += 1;
  }
  return index;
}



export function webSearchProtocolInsertIndex(content: unknown[], hasWebSearchBlocks: boolean): number {
  let index = leadingThinkingBlockCount(content);
  if (!hasWebSearchBlocks) {
    return index;
  }
  while (index < content.length) {
    const block = content[index];
    const type = isRecord(block) ? stringValue(block.type) : undefined;
    if (type !== "server_tool_use" && type !== "web_search_tool_result") {
      break;
    }
    index += 1;
  }
  return index;
}



export function mergeAnthropicWebSearchUsage(usage: unknown, searchCount: number): Record<string, unknown> {
  const nextUsage = isRecord(usage) ? { ...usage } : {};
  const serverToolUse = isRecord(nextUsage.server_tool_use) ? { ...nextUsage.server_tool_use } : {};
  const webSearchRequests = Math.max(1, Math.trunc(searchCount));
  serverToolUse.web_search_requests = Math.max(numberValue(serverToolUse.web_search_requests) ?? 0, webSearchRequests);
  nextUsage.server_tool_use = serverToolUse;
  return nextUsage;
}



export function sseEventsContainAnthropicWebSearchBlocks(events: ParsedSseEvent[]): boolean {
  return events.some((event) => {
    return sseEventContainsAnthropicWebSearchBlock(event);
  });
}



export function sseEventsContainVisibleText(events: ParsedSseEvent[]): boolean {
  return events.some(sseEventContainsVisibleText);
}



export function sseEventContainsAnthropicWebSearchBlock(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  const type = stringValue(block?.type) || stringValue(data?.type);
  return type === "server_tool_use" || type === "web_search_tool_result";
}



export function sseEventContainsVisibleText(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  if (!data) {
    return false;
  }
  const block = isRecord(data.content_block) ? data.content_block : undefined;
  if (stringValue(data.type) === "content_block_start" && stringValue(block?.type) === "text") {
    return Boolean(stringValue(block?.text)?.trim());
  }
  const delta = isRecord(data.delta) ? data.delta : undefined;
  return stringValue(data.type) === "content_block_delta" &&
    stringValue(delta?.type) === "text_delta" &&
    Boolean(stringValue(delta?.text)?.trim());
}



export function sseEventsContainAnthropicClientToolUse(events: ParsedSseEvent[]): boolean {
  return events.some(sseEventContainsAnthropicClientToolUse);
}



export function sseEventContainsAnthropicClientToolUse(event: ParsedSseEvent): boolean {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  return stringValue(data?.type) === "content_block_start" && stringValue(block?.type) === "tool_use";
}



export function anthropicSseTextBlockStartIndex(event: ParsedSseEvent): number | undefined {
  const data = isRecord(event.data) ? event.data : undefined;
  const block = isRecord(data?.content_block) ? data.content_block : undefined;
  if (stringValue(data?.type) !== "content_block_start" || stringValue(block?.type) !== "text") {
    return undefined;
  }
  const index = numberValue(data?.index);
  return index === undefined ? undefined : index;
}



export function sseEventIsAnthropicMessageEnd(event: ParsedSseEvent): boolean {
  const type = isRecord(event.data) ? stringValue(event.data.type) : undefined;
  return type === "message_delta" || type === "message_stop";
}



export function anthropicWebSearchSseEventsForBlock(block: Record<string, unknown>, index: number): ParsedSseEvent[] {
  if (stringValue(block.type) === "text") {
    const text = stringValue(block.text) ?? "";
    return [
      sseEventFromValue({
        content_block: { text: "", type: "text" },
        index,
        type: "content_block_start"
      }),
      sseEventFromValue({
        delta: { text, type: "text_delta" },
        index,
        type: "content_block_delta"
      }),
      sseEventFromValue({
        index,
        type: "content_block_stop"
      })
    ];
  }
  return [
    sseEventFromValue({
      content_block: block,
      index,
      type: "content_block_start"
    }),
    sseEventFromValue({
      index,
      type: "content_block_stop"
    })
  ];
}



export function updateAnthropicWebSearchSseUsage(
  event: ParsedSseEvent,
  searchCount: number,
  didSynthesizeAnswer: boolean,
  hasClientToolUse: boolean
): ParsedSseEvent {
  if (!isRecord(event.data) || stringValue(event.data.type) !== "message_delta") {
    return event;
  }
  const delta = isRecord(event.data.delta) ? { ...event.data.delta } : event.data.delta;
  const nextData: Record<string, unknown> = {
    ...event.data,
    usage: mergeAnthropicWebSearchUsage(event.data.usage, searchCount)
  };
  if (isRecord(delta) && shouldEndAnthropicHostedWebSearchTurn(delta.stop_reason, didSynthesizeAnswer, hasClientToolUse)) {
    nextData.delta = { ...delta, stop_reason: "end_turn" };
  }
  return {
    ...event,
    data: nextData
  };
}



export function shouldEndAnthropicHostedWebSearchTurn(
  stopReason: unknown,
  didSynthesizeAnswer: boolean,
  hasClientToolUse: boolean
): boolean {
  if (hasClientToolUse) {
    return false;
  }
  const normalized = stringValue(stopReason);
  return normalized === "tool_use" || (didSynthesizeAnswer && normalized === "max_tokens");
}



export function synthesizeWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], queryHint: string | undefined): string | undefined {
  const query = queryHint || records.map((record) => record.query).find(Boolean) || "";
  const weatherAnswer = synthesizeWeatherWebSearchAnswer(records, query);
  if (weatherAnswer) {
    return weatherAnswer;
  }
  const componentChangelogAnswer = synthesizeComponentChangelogWebSearchAnswer(records, query);
  if (componentChangelogAnswer) {
    return componentChangelogAnswer;
  }
  const evidence = topWebSearchEvidenceSentences(records, query, 3);
  if (evidence.length === 0) {
    const sources = webSearchSourceNames(records, 3);
    if (!sources) {
      return undefined;
    }
    return containsCjkText(query)
      ? `搜索已完成，但页面可提取正文不足。较相关的来源包括：${sources}。`
      : `The search completed, but the pages did not expose enough extractable text. The most relevant sources are: ${sources}.`;
  }
  const sources = webSearchSourceNames(records, 3);
  return containsCjkText(query)
    ? `根据搜索结果，${evidence.join("；")}。${sources ? `来源：${sources}。` : ""}`
    : `Based on the search results, ${evidence.join("; ")}.${sources ? ` Sources: ${sources}.` : ""}`;
}



function synthesizeComponentChangelogWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], query: string): string | undefined {
  const normalizedQuery = normalizeSearchComparisonText(query);
  const asksForComponents = /component|components|组件/i.test(query);
  const asksForNewOrChangelog = /new|latest|recent|changelog|release|新增|新组件|最新|更新|官方/i.test(query);
  if (!asksForComponents || !asksForNewOrChangelog) {
    return undefined;
  }
  const items = webSearchEvidenceItems(records);
  const preferred = items.find((item) => {
    const normalized = normalizeSearchComparisonText(`${item.source} ${item.url} ${item.text.slice(0, 500)}`);
    return normalized.includes("changelog") || normalized.includes("official") || normalized.includes("docs") || normalizedQuery.includes("official");
  }) ?? items[0];
  if (!preferred) {
    return undefined;
  }
  const release = extractComponentReleaseTitle(preferred.text);
  const components = extractLikelyComponentNames(preferred.text);
  const sources = webSearchSourceNames(records, 2);
  const cjk = containsCjkText(query);
  if (!release && components.length === 0) {
    return undefined;
  }
  if (cjk) {
    return [
      release ? `官方相关条目是 ${release}` : "官方页面包含新增组件相关内容",
      components.length > 0 ? `可提取到的相关组件包括 ${components.join("、")}` : "",
      sources ? `来源：${sources}。` : ""
    ].filter(Boolean).join("；");
  }
  return [
    release ? `The relevant official entry is ${release}` : "The official page contains new component information",
    components.length > 0 ? `extractable related components include ${components.join(", ")}` : "",
    sources ? `Sources: ${sources}.` : ""
  ].filter(Boolean).join("; ");
}



function extractComponentReleaseTitle(text: string): string | undefined {
  const patterns = [
    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s*-\s*Components?[^.。!?]{0,90})/i,
    /(\d{4}[-/]\d{1,2}[^.。!?]{0,60}Components?[^.。!?]{0,60})/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const title = match?.[1]?.replace(/\s+/g, " ").trim();
    if (title) {
      return title;
    }
  }
  return undefined;
}



function extractLikelyComponentNames(text: string): string[] {
  const knownNames = [
    "Message Scroller",
    "Message",
    "Attachment",
    "Bubble",
    "Marker",
    "Empty",
    "Item",
    "Field",
    "Input OTP",
    "Button Group"
  ];
  const lower = text.toLowerCase();
  return knownNames.filter((name) => lower.includes(name.toLowerCase())).slice(0, 10);
}



function synthesizeWeatherWebSearchAnswer(records: BrowserWebSearchProtocolRecord[], query: string): string | undefined {
  if (!/天气|气温|温度|weather|forecast|temperature/i.test(query)) {
    return undefined;
  }
  const items = webSearchEvidenceItems(records);
  const text = items.map((item) => item.text).join(" ");
  if (!text) {
    return undefined;
  }
  const cjk = containsCjkText(query);
  const location = extractWeatherLocation(query);
  const temperatureRange = weatherTemperatureRange(text);
  const currentTemperature = firstRegexGroup(text, [
    /(?:当前|现在|实时|实况|气温|温度)[^。；，,\d-]{0,12}(-?\d{1,2}(?:\.\d+)?)\s*℃/i,
    location ? new RegExp(`${escapeRegExp(location)}\\s+(-?\\d{1,2}(?:\\.\\d+)?)\\s*℃`) : undefined
  ]);
  const feelsLike = firstRegexGroup(text, [/体感温度[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const high = firstRegexGroup(text, [/最高气温[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const low = firstRegexGroup(text, [/最低气温[：:\s]*(-?\d{1,2}(?:\.\d+)?)\s*℃/]);
  const humidity = firstRegexGroup(text, [/(?:最大相对湿度|相对湿度)[：:\s]*(-?\d{1,3}(?:\.\d+)?%)/]);
  const aqi = firstRegexGroup(text, [/AQI最高值[：:\s]*(\d{1,3})/i]);
  const airQuality = firstRegexGroup(text, [/空气质量[：:\s]*([^\s，。；,;]{1,12})/]);
  const rain = firstRegexGroup(text, [/(?:过去24小时总降水量|总降水量|降水量)[：:\s]*(-?\d+(?:\.\d+)?mm)/i]);
  const wind = firstRegexGroup(text, [/最大风力[：:\s]*([<>]?\d+级|微风)/, /(东风|东南风|南风|西南风|西风|西北风|北风|东北风)\s*([<>]?\d+级|微风)/]);

  const facts = [
    currentTemperature ? (cjk ? `当前约 ${currentTemperature}℃` : `currently about ${currentTemperature}°C`) : undefined,
    !currentTemperature && temperatureRange ? (cjk ? `气温约 ${temperatureRange}` : `temperatures are around ${temperatureRange}`) : undefined,
    feelsLike ? (cjk ? `体感约 ${feelsLike}℃` : `feels like about ${feelsLike}°C`) : undefined,
    high || low ? (cjk
      ? `过去24小时${high ? `最高 ${high}℃` : ""}${high && low ? "、" : ""}${low ? `最低 ${low}℃` : ""}`
      : `over the past 24 hours ${high ? `the high was ${high}°C` : ""}${high && low ? " and " : ""}${low ? `the low was ${low}°C` : ""}`) : undefined,
    humidity ? (cjk ? `相对湿度最高 ${humidity}` : `relative humidity reached ${humidity}`) : undefined,
    aqi ? (cjk ? `AQI 最高 ${aqi}` : `AQI reached ${aqi}`) : undefined,
    airQuality && !aqi ? (cjk ? `空气质量 ${airQuality}` : `air quality is ${airQuality}`) : undefined,
    rain ? (cjk ? `过去24小时降水量 ${rain}` : `24-hour rainfall is ${rain}`) : undefined,
    wind ? (cjk ? `风力 ${wind}` : `wind ${wind}`) : undefined
  ].filter((item): item is string => Boolean(item));

  if (facts.length === 0) {
    return undefined;
  }
  const sources = webSearchSourceNames(records, 2);
  if (cjk) {
    return `${location ? `${location}天气` : "天气"}：${facts.slice(0, 6).join("，")}。${sources ? `来源：${sources}。` : ""}`;
  }
  return `${location ? `${location} weather` : "Weather"}: ${facts.slice(0, 6).join(", ")}.${sources ? ` Sources: ${sources}.` : ""}`;
}



function webSearchEvidenceItems(records: BrowserWebSearchProtocolRecord[]): Array<{ source: string; text: string; url: string }> {
  return records.flatMap((record) => record.results.map((result) => ({
    source: result.title || hostnameFromUrl(result.url) || record.engine,
    text: sanitizeWebSearchEvidenceText(result.content || result.snippet || ""),
    url: result.url
  }))).filter((item) => item.text);
}



function topWebSearchEvidenceSentences(records: BrowserWebSearchProtocolRecord[], query: string, limit: number): string[] {
  const terms = relevantSearchTerms(query);
  const scored = webSearchEvidenceItems(records).flatMap((item, itemIndex) => {
    const sentences = splitEvidenceSentences(item.text).slice(0, 12);
    return sentences.map((sentence, sentenceIndex) => {
      const normalizedSentence = normalizeSearchComparisonText(sentence);
      const termScore = terms.reduce((score, term) => score + (normalizedSentence.includes(term) ? 2 : 0), 0);
      const sourceBonus = itemIndex === 0 ? 2 : itemIndex === 1 ? 1 : 0;
      const positionBonus = Math.max(0, 4 - sentenceIndex) / 4;
      return {
        score: termScore + sourceBonus + positionBonus,
        sentence
      };
    });
  }).filter((item) => item.sentence.length >= 12 && item.sentence.length <= 260);
  scored.sort((left, right) => right.score - left.score || left.sentence.length - right.sentence.length);
  const seen = new Set<string>();
  return scored.flatMap((item) => {
    const key = normalizeSearchComparisonText(item.sentence).slice(0, 120);
    if (!key || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [item.sentence];
  }).slice(0, limit);
}



function splitEvidenceSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/[。！？!?]\s*|\n+/g)
    .map((sentence) => sentence.trim().replace(/[，,；;：:]\s*$/, ""))
    .filter((sentence) => sentence && !looksLikeNavigationText(sentence));
}



function looksLikeNavigationText(text: string): boolean {
  const punctuationCount = (text.match(/[，,。；;：:]/g) ?? []).length;
  const digitCount = (text.match(/\d/g) ?? []).length;
  return text.length > 160 && punctuationCount < 2 && digitCount < 2;
}



function relevantSearchTerms(query: string): string[] {
  const normalizedTerms = normalizeSearchComparisonText(query)
    .split(" ")
    .filter((term) => term.length >= 2);
  const cjkTerms = query.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  return uniqueStrings([...normalizedTerms, ...cjkTerms].map((term) => term.toLowerCase()));
}



function weatherTemperatureRange(text: string): string | undefined {
  const values = Array.from(text.matchAll(/(-?\d{1,2}(?:\.\d+)?)\s*℃/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > -80 && value < 60)
    .slice(0, 8);
  if (values.length === 0) {
    return undefined;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const format = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  return min === max ? `${format(min)}℃` : `${format(min)}-${format(max)}℃`;
}



function extractWeatherLocation(query: string): string | undefined {
  const cleaned = query
    .replace(/perform\s+a\s+web\s+search\s+for\s+the\s+query:\s*/i, "")
    .replace(/天气预报|天气|气温|温度|怎么样|如何|查询|搜索|今天|今日|现在|当前|请问|weather|forecast|temperature/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 24) {
    return undefined;
  }
  return cleaned;
}



function firstRegexGroup(text: string, patterns: Array<RegExp | undefined>): string | undefined {
  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    const match = pattern.exec(text);
    const value = match?.[1];
    if (value) {
      return value.trim();
    }
  }
  return undefined;
}



function sanitizeWebSearchEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}



function containsCjkText(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}



function webSearchSourceNames(records: BrowserWebSearchProtocolRecord[], limit: number): string {
  return uniqueStrings(records.flatMap((record) => record.results.map((result) => {
    const title = result.title?.trim();
    return title || hostnameFromUrl(result.url) || record.engine;
  }))).slice(0, limit).join("、");
}



function hostnameFromUrl(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}



function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}



export function anthropicWebSearchProtocolBlocks(records: BrowserWebSearchProtocolRecord[], requestId: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  records.forEach((record, index) => {
    const toolUseId = `srvtoolu_${sanitizeAnthropicToolUseId(requestId)}_${index + 1}`;
    blocks.push({
      id: toolUseId,
      input: { query: record.query },
      name: "web_search",
      type: "server_tool_use"
    });
    blocks.push({
      content: record.results.map(anthropicWebSearchResultBlock),
      tool_use_id: toolUseId,
      type: "web_search_tool_result"
    });
  });
  return blocks;
}



function anthropicWebSearchResultBlock(result: BrowserWebSearchProtocolResult): Record<string, unknown> {
  const snippet = anthropicWebSearchResultSnippet(result);
  return {
    encrypted_content: "",
    ...(snippet ? { snippet: snippet.slice(0, 1_200) } : {}),
    title: result.title,
    type: "web_search_result",
    url: result.url
  };
}



function anthropicWebSearchResultSnippet(result: BrowserWebSearchProtocolResult): string | undefined {
  const parts = [
    result.snippet ? `Search snippet: ${sanitizeWebSearchEvidenceText(result.snippet)}` : "",
    result.content ? `Extracted page content: ${sanitizeWebSearchEvidenceText(result.content)}` : "",
    result.diagnostics?.length ? `Diagnostics: ${result.diagnostics.join("; ")}` : ""
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}



export function sanitizeAnthropicToolUseId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || randomBytes(8).toString("hex");
}
