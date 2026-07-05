import type { ProxyNetworkExchange } from "@ccr/core/contracts/app";

export function networkExchangeMatchesQuery(exchange: ProxyNetworkExchange, query: string): boolean {
  if (!query) {
    return true;
  }

  return [
    exchange.method,
    exchange.url,
    exchange.upstreamUrl,
    exchange.host,
    exchange.client,
    exchange.path,
    exchange.protocol,
    exchange.mode,
    networkLifecycleLabel(exchange),
    networkCodeLabel(exchange),
    networkStatusLabel(exchange),
    formatNetworkHeaders(exchange.requestHeaders),
    formatNetworkHeaders(exchange.responseHeaders ?? {}),
    exchange.requestBody.text,
    exchange.responseBody?.text ?? "",
    exchange.error ?? ""
  ].some((value) => value.toLowerCase().includes(query));
}

export function networkRowId(exchange: ProxyNetworkExchange, index: number, total: number): string {
  const numeric = Number(exchange.id);
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(numeric);
  }
  return String(Math.max(1, total - index));
}

export function networkLifecycleLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.state === "pending") {
    return "Active";
  }
  if (exchange.state === "error") {
    return "Error";
  }
  return "Completed";
}

export function networkCodeLabel(exchange: ProxyNetworkExchange): string {
  return exchange.statusCode === undefined ? "-" : String(exchange.statusCode);
}

export function networkStatusLabel(exchange: ProxyNetworkExchange): string {
  if (exchange.statusCode !== undefined) {
    return String(exchange.statusCode);
  }
  return exchange.state;
}

export function networkStatusVariant(exchange: ProxyNetworkExchange): "danger" | "outline" | "success" | "warning" {
  if (exchange.state === "pending") {
    return "warning";
  }
  if (exchange.state === "error") {
    return "danger";
  }
  const status = exchange.statusCode ?? 0;
  if (status >= 200 && status < 400) {
    return "success";
  }
  if (status >= 400) {
    return "danger";
  }
  return "outline";
}

export function formatNetworkHeaders(headers: Record<string, string | string[]>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n");
}

export function networkHeaderRows(headers: Record<string, string | string[]>): Array<[string, string]> {
  return Object.entries(headers).map(([key, value]) => [formatHeaderName(key), Array.isArray(value) ? value.join(", ") : value]);
}

export function networkQueryRows(url: string): Array<[string, string]> {
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.entries());
  } catch {
    return [];
  }
}

export function networkSummaryRows(exchange: ProxyNetworkExchange): Array<[string, string]> {
  return [
    ["URL", exchange.url],
    ["Upstream", exchange.upstreamUrl],
    ["Client", exchange.client],
    ["Protocol", exchange.protocol.toUpperCase()],
    ["Mode", exchange.mode],
    ["Method", exchange.method],
    ["Status", networkLifecycleLabel(exchange)],
    ["Code", networkCodeLabel(exchange)],
    ["Started", formatNetworkDateTime(exchange.startedAt)],
    ["Completed", exchange.completedAt ? formatNetworkDateTime(exchange.completedAt) : "-"],
    ["Duration", formatDuration(exchange.durationMs)],
    ["Request size", formatBytes(exchange.requestBody.sizeBytes)],
    ["Response size", exchange.responseBody ? formatBytes(exchange.responseBody.sizeBytes) : "0 B"]
  ];
}

export function formatNetworkRequestRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.requestHeaders);
  return [
    `${exchange.method} ${exchange.path || "/"} HTTP/1.1`,
    headers,
    "",
    exchange.requestBody.text || ""
  ].join("\n");
}

export function formatNetworkResponseRaw(exchange: ProxyNetworkExchange): string {
  const headers = formatNetworkHeaders(exchange.responseHeaders ?? {});
  return [
    `HTTP/1.1 ${networkCodeLabel(exchange)} ${networkLifecycleLabel(exchange)}`,
    headers,
    "",
    exchange.responseBody?.text || ""
  ].join("\n");
}

export function formatHeaderName(value: string): string {
  return value
    .split("-")
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join("-");
}

export function clientInitial(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "CLI";
  }
  if (normalized.toLowerCase().includes("chrome")) {
    return "C";
  }
  if (normalized.toLowerCase().includes("codex")) {
    return "CCR";
  }
  return normalized.slice(0, 3).toUpperCase();
}

export function formatNetworkTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatNetworkDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    year: "numeric"
  });
}

export function formatDuration(value: number | undefined): string {
  if (value === undefined) {
    return "pending";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
