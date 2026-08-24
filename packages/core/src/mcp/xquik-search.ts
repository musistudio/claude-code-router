export type XquikSearchResult = {
  snippet?: string;
  title: string;
  url: string;
};

export const defaultXquikSearchEndpoint = "https://xquik.com/api/v1/x/tweets/search";

export function xquikSearchUrl(
  endpoint: string | undefined,
  query: string,
  count: number,
  language?: string
): string {
  const url = new URL(endpoint || defaultXquikSearchEndpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("queryType", "Latest");
  url.searchParams.set("limit", String(Math.min(25, Math.max(1, Math.trunc(count)))));
  url.searchParams.set("replies", "exclude");
  url.searchParams.set("retweets", "exclude");
  url.searchParams.set("quotes", "exclude");
  if (language) {
    url.searchParams.set("language", language);
  }
  return url.toString();
}

export function xquikSearchResults(payload: unknown, count: number): XquikSearchResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.tweets)) {
    return [];
  }

  const limit = Math.min(25, Math.max(1, Math.trunc(count)));
  const seenIds = new Set<string>();
  const results: XquikSearchResult[] = [];
  for (const value of payload.tweets) {
    if (!isRecord(value)) {
      continue;
    }
    const id = normalizedTweetId(value.id);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);

    const username = isRecord(value.author) ? normalizedUsername(value.author.username) : undefined;
    const text = normalizedText(value.text);
    results.push({
      ...(text ? { snippet: text } : {}),
      title: username ? `Post by @${username} on X` : "Post on X",
      url: username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`
    });
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function normalizedTweetId(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{1,25}$/.test(value) ? value : undefined;
}

function normalizedUsername(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : undefined;
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 1200) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
