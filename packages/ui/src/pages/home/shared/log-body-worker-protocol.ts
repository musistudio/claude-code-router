import type { RequestLogBody } from "@ccr/core/contracts/app";
import { formatLogBodyView, type FormattedLogBody } from "./logs";

export const logBodyLargeTextThreshold = 256 * 1024;
export const logBodyPreviewTextLimit = 160 * 1024;

export type LogBodyFormatMode = "full" | "preview";

export type LogBodyFormatRequest = {
  body?: RequestLogBody;
  bodyKey: string;
  id: number;
  kind: "format";
  largeTextThreshold?: number;
  mode: LogBodyFormatMode;
  previewTextLimit?: number;
  query: string;
};

export type LogBodyFilterRequest = {
  bodyKey: string;
  id: number;
  kind: "filter";
  mode: LogBodyFormatMode;
  query: string;
};

export type LogBodyWorkerRequest = LogBodyFilterRequest | LogBodyFormatRequest;

export type LogBodyFormatResult = FormattedLogBody & {
  bodyKey: string;
  formattedTextLength: number;
  id: number;
  kind: "format-result";
  large: boolean;
  mode: LogBodyFormatMode;
  ok: true;
  preview: boolean;
  query: string;
  sourceSizeBytes: number;
  visible: string;
};

export type LogBodyFilterResult = {
  bodyKey: string;
  id: number;
  kind: "filter-result";
  mode: LogBodyFormatMode;
  ok: true;
  query: string;
  visible: string;
};

export type LogBodyWorkerError = {
  bodyKey?: string;
  id: number;
  kind: "error";
  message: string;
  mode?: LogBodyFormatMode;
  operation: LogBodyWorkerRequest["kind"];
};

export type LogBodyWorkerResponse = LogBodyFilterResult | LogBodyFormatResult | LogBodyWorkerError;

export function isLargeLogBody(
  body: RequestLogBody | undefined,
  threshold = logBodyLargeTextThreshold
): boolean {
  if (!body) {
    return false;
  }
  return Boolean(body.preview) || Math.max(body.sizeBytes, body.text.length) > threshold;
}

export function createLogBodyPreviewText(
  body: RequestLogBody | undefined,
  limit = logBodyPreviewTextLimit
): string {
  if (!body || (!body.text && body.sizeBytes === 0)) {
    return "No body";
  }

  const text = body.text || "";
  if (!text) {
    return "Body text is not loaded.";
  }
  if (text.length <= limit) {
    return text;
  }

  const headLength = Math.max(0, Math.floor(limit * 0.65));
  const tailLength = Math.max(0, limit - headLength);
  const omitted = Math.max(0, text.length - headLength - tailLength);
  const head = text.slice(0, headLength);
  const tail = tailLength > 0 ? text.slice(-tailLength) : "";
  return [
    head,
    "",
    `... ${omitted} characters omitted from preview ...`,
    "",
    tail
  ].join("\n");
}

export function formatLogBodyForWorker(
  body: RequestLogBody | undefined,
  mode: LogBodyFormatMode,
  largeTextThreshold = logBodyLargeTextThreshold,
  previewTextLimit = logBodyPreviewTextLimit
): FormattedLogBody & {
  large: boolean;
  preview: boolean;
  sourceSizeBytes: number;
} {
  const large = isLargeLogBody(body, largeTextThreshold);
  const preview = large && mode !== "full";
  // Large-body preview: only skip the full JSON parse/pretty-print when the actual
  // text is over-length. Otherwise the worker does JSON.parse on a huge object graph
  // and pretty-prints + structured-clones it back, blowing up memory/CPU and surfacing
  // "Body formatter worker failed." (issue #1694).
  // The judge is the real body.text length, not sizeBytes (sizeBytes may be inflated
  // storage metadata; a preview:true lightweight JSON should still show its JSON tree).
  const previewText: FormattedLogBody | undefined = preview && (body?.text?.length ?? 0) > previewTextLimit
    ? { text: createLogBodyPreviewText(body, previewTextLimit) }
    : undefined;
  const formattedBodyView = previewText ?? formatLogBodyView(body);
  const bodyView = preview && formattedBodyView.json === undefined
    ? { text: createLogBodyPreviewText(body, previewTextLimit) }
    : formattedBodyView;
  return {
    ...bodyView,
    large,
    preview,
    sourceSizeBytes: body?.sizeBytes ?? 0
  };
}
