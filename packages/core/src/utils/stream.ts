import { SSEParserTransform, SSESerializerTransform } from "./sse";

export interface StreamContext {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
}

export function createSSEStreamReader(
  response: Response,
  processLine: (line: string, context: StreamContext) => void,
  options?: {
    bufferSize?: number;
    onComplete?: (context: StreamContext) => void;
    logger?: any;
  }
): Response {
  const encoder = new TextEncoder();
  let streamFailed = false;

  const stream = new ReadableStream({
    async start(controller) {
      if (!response.body) {
        controller.close();
        return;
      }

      const ctx: StreamContext = { controller, encoder };

      try {
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(new SSEParserTransform())
          .pipeThrough(new SSESerializerTransform())
          .getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          if (!value) continue;

          // The SSESerializerTransform outputs clean string blocks (e.g., "data: ...\n\n")
          // Split into lines to maintain backward compatibility with the processLine callback
          const lines = value.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              processLine(line, ctx);
            } catch (error) {
              (options?.logger?.error ?? console.error)("Error processing line:", line, error);
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        }
      } catch (error) {
        (options?.logger?.error ?? console.error)("Stream error:", error);
        streamFailed = true;
        controller.error(error);
      } finally {
        try {
          options?.onComplete?.(ctx);
        } catch (error) {
          (options?.logger?.error ?? console.error)("Stream completion error:", error);
          if (!streamFailed) {
            streamFailed = true;
            controller.error(error);
          }
        }

        if (!streamFailed) {
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function encodeSSEData(data: string, encoder: TextEncoder): Uint8Array {
  return encoder.encode(`data: ${data}\n\n`);
}

export function encodeSSELine(line: string, encoder: TextEncoder): Uint8Array {
  return encoder.encode(line + "\n");
}
