import {
  formatLogBodyForWorker,
  logBodyLargeTextThreshold,
  logBodyPreviewTextLimit,
  type LogBodyFilterRequest,
  type LogBodyFormatRequest,
  type LogBodyFormatResult,
  type LogBodyWorkerRequest,
  type LogBodyWorkerResponse
} from "./log-body-worker-protocol";
import { filterLogText, type FormattedLogBody } from "./logs";

type CachedFormattedBody = FormattedLogBody & {
  bodyKey: string;
  large: boolean;
  mode: LogBodyFormatRequest["mode"];
  preview: boolean;
  sourceSizeBytes: number;
};

type LogBodyWorkerGlobal = {
  onmessage: ((event: MessageEvent<LogBodyWorkerRequest>) => void) | null;
  postMessage: (message: LogBodyWorkerResponse) => void;
};

const worker = self as unknown as LogBodyWorkerGlobal;
let cachedBody: CachedFormattedBody | undefined;

worker.onmessage = (event: MessageEvent<LogBodyWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "format") {
      worker.postMessage(formatBody(request) satisfies LogBodyWorkerResponse);
      return;
    }
    worker.postMessage(filterBody(request) satisfies LogBodyWorkerResponse);
  } catch (error) {
    worker.postMessage({
      bodyKey: "bodyKey" in request ? request.bodyKey : undefined,
      id: request.id,
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
      mode: "mode" in request ? request.mode : undefined,
      operation: request.kind
    } satisfies LogBodyWorkerResponse);
  }
};

function formatBody(request: LogBodyFormatRequest): LogBodyFormatResult {
  const threshold = request.largeTextThreshold ?? logBodyLargeTextThreshold;
  const previewLimit = request.previewTextLimit ?? logBodyPreviewTextLimit;
  const { large, preview, sourceSizeBytes, ...bodyView } = formatLogBodyForWorker(
    request.body,
    request.mode,
    threshold,
    previewLimit
  );
  const visible = filterLogText(bodyView.text, request.query);

  cachedBody = {
    ...bodyView,
    bodyKey: request.bodyKey,
    large,
    mode: request.mode,
    preview,
    sourceSizeBytes
  };

  return {
    ...bodyView,
    bodyKey: request.bodyKey,
    formattedTextLength: bodyView.text.length,
    id: request.id,
    kind: "format-result",
    large,
    mode: request.mode,
    ok: true,
    preview,
    query: request.query,
    sourceSizeBytes,
    visible
  };
}

function filterBody(request: LogBodyFilterRequest): LogBodyWorkerResponse {
  if (!cachedBody || cachedBody.bodyKey !== request.bodyKey || cachedBody.mode !== request.mode) {
    throw new Error("Formatted body cache is not available.");
  }

  return {
    bodyKey: request.bodyKey,
    id: request.id,
    kind: "filter-result",
    mode: request.mode,
    ok: true,
    query: request.query,
    visible: filterLogText(cachedBody.text, request.query)
  };
}
