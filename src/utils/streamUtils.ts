import { sessionUsageCache } from "./cache";
import { StreamMetadata, PSSEResponse, StreamErrorInfo } from "./types";

/**
 * Pads a number with leading zero if needed
 */
export function padZero(num: number): string {
  return (num > 9 ? "" : "0") + num;
}

/**
 * Generates log file names with timestamp
 */
export function generateLogFileName(time?: Date, index?: number): string {
  if (!time) {
    time = new Date();
  }

  const yearAndMonth = time.getFullYear() + "" + padZero(time.getMonth() + 1);
  const day = padZero(time.getDate());
  const hour = padZero(time.getHours());
  const minute = padZero(time.getMinutes());
  const second = padZero(time.getSeconds());

  return `./logs/ccr-${yearAndMonth}${day}${hour}${minute}${second}${index ? `_${index}` : ''}.log`;
}

/**
 * Parse SSE content to extract structured information
 */
export function parseSSEContent(events: string[]): string | PSSEResponse {
  try {
    const messages = [];
    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line.length > 6) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              messages.push(data.delta.text);
            } else if (data.type === 'content_block_start' && data.content_block?.type === 'text') {
              messages.push(data.content_block.text);
            }
          } catch (e) {
            // Ignore parsing errors and continue processing other data
          }
        }
      }
    }

    if (messages.length > 0) {
      return {
        type: "parsed_sse_response",
        body: messages.join(''),
        summary: {
          totalEvents: events.length,
          hasUsage: messages.some(m => m.type === 'usage'),
          textEvents: messages.filter(m => m.type === 'text').length
        }
      };
    }
  } catch (parseError) {
    console.warn('Failed to parse SSE content:', parseError.message);
  }

  return events;
}

/**
 * Create a wrapped stream that logs complete response content
 */
export function createLoggingWrappedStream(
  originalStream: ReadableStream,
  req: any,
  reply: any
): ReadableStream {
  const loggedChunks: string[] = [];
  const startTime = Date.now();

  return new ReadableStream({
    async start(controller) {
      const reader = originalStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            await handleStreamCompletion(loggedChunks, startTime, req, reply, controller);
            break;
          }

          const chunkText = new TextDecoder().decode(value);
          loggedChunks.push(chunkText);
          controller.enqueue(value);
        }
      } catch (error) {
        handleStreamError(error as Error, loggedChunks, startTime, req, controller);
      }
    }
  });
}

/**
 * Handle stream completion and logging
 */
async function handleStreamCompletion(
  loggedChunks: string[],
  startTime: number,
  req: any,
  reply: any,
  controller: ReadableStreamDefaultController
): Promise<void> {
  const endTime = Date.now();
  const duration = endTime - startTime;

  req.log.info({
    streamCompleteResponse: {
      type: "ReadableStream_complete_response",
      content: parseSSEContent(loggedChunks),
      metadata: createStreamMetadata(loggedChunks.length, duration, req, reply),
    },
    msg: "Complete stream response"
  }, "Stream response completed - full body");

  controller.close();
}

/**
 * Handle stream errors
 */
function handleStreamError(
  error: Error,
  loggedChunks: string[],
  startTime: number,
  req: any,
  controller: ReadableStreamDefaultController
): void {
  const endTime = Date.now();
  const duration = endTime - startTime;

  req.log.error({
    streamError: createStreamErrorInfo(error, loggedChunks.length, duration, req),
  }, "Stream reading error");

  controller.error(error);
}

/**
 * Create stream metadata for logging
 */
function createStreamMetadata(
  totalChunks: number,
  duration: number,
  req: any,
  reply: any
): StreamMetadata {
  return {
    totalChunks,
    duration,
    method: req.method,
    url: req.url,
    statusCode: reply.statusCode,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create stream error information for logging
 */
function createStreamErrorInfo(
  error: Error,
  chunksCollected: number,
  duration: number,
  req: any
): StreamErrorInfo {
  return {
    error: error.message,
    stack: error.stack || '',
    metadata: {
      chunksCollected,
      duration,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Read session usage from stream in background
 */
export function readSessionUsageFromStream(stream: ReadableStream, sessionId: string): void {
  const read = async (stream: ReadableStream) => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const dataStr = new TextDecoder().decode(value);
        if (!dataStr.startsWith("event: message_delta")) {
          continue;
        }

        const str = dataStr.slice(27);
        try {
          const message = JSON.parse(str);
          sessionUsageCache.put(sessionId, message.usage);
        } catch {
          // Ignore parsing errors
        }
      }
    } catch (readError: any) {
      handleBackgroundReadError(readError);
    } finally {
      reader.releaseLock();
    }
  };

  read(stream);
}

/**
 * Handle background read stream errors
 */
function handleBackgroundReadError(readError: any): void {
  if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
    console.error('Background read stream closed prematurely');
  } else {
    console.error('Error in background stream reading:', readError);
  }
}