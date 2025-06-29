import { Response } from "express";
import { log } from "./log";

// A simplified interface for the events we care about
interface HandledEvent {
  type: string;
  delta?: { text: string };
  response?: { status: string };
  error?: { message: string };
}

export async function streamOpenAIResponse(
  res: Response,
  stream: any, // The stream from openai.responses.create
  model: string,
  body: any
) {
  const write = (data: string) => {
    log("response: ", data);
    res.write(data);
  };

  const messageId = `msg_${Date.now()}`;
  const contentBlockId = `content-block-${Date.now()}`;
  let hasTextBlockStarted = false;

  try {
    // Send message_start event immediately
    const messageStart = {
      type: "message_start",
      message: {
        id: messageId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 }, // Dummy usage
      },
    };
    write(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`);

    for await (const event of stream) {
      log("event received", JSON.stringify(event, null, 2));

      switch (event.type) {
        case 'response.output_text.delta':
          if (!hasTextBlockStarted) {
            // If this is the first text delta, send content_block_start
            const contentBlockStart = {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', id: contentBlockId, text: '' },
            };
            write(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`);
            hasTextBlockStarted = true;
          }
          // Send the actual text chunk
          const contentDelta = {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: event.delta },
          };
          write(`event: content_block_delta\ndata: ${JSON.stringify(contentDelta)}\n\n`);
          break;

        case 'response.completed':
          if (hasTextBlockStarted) {
            // Stop the text block if it was started
            const contentBlockStop = {
              type: 'content_block_stop',
              index: 0,
            };
            write(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`);
          }

          // Send message_delta with the final stop reason
          const messageDelta = {
            type: 'message_delta',
            delta: {
              stop_reason: 'end_turn', // Derived from 'completed' status
              stop_sequence: null,
            },
            usage: { output_tokens: event.response?.usage?.output_tokens || 1 },
          };
          write(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`);
          break;

        case 'response.error':
          log('Stream error:', event.error);
          const errorJson = JSON.stringify({ type: 'error', error: { type: 'api_error', message: event.error?.message || 'Unknown error' } });
          write(`event: error\ndata: ${errorJson}\n\n`);
          break;

        // Other events are logged but ignored for the client-side stream
        case 'response.created':
        case 'response.in_progress':
        case 'response.web_search_call.in_progress':
        case 'response.web_search_call.searching':
        case 'response.web_search_call.completed':
        case 'response.output_text.done':
          break;
      }
    }
  } catch (e: any) {
    log("Error in stream processing:", e);
    const errorJson = JSON.stringify({ type: 'error', error: { type: 'internal_server_error', message: e.message } });
    write(`event: error\ndata: ${errorJson}\n\n`);
  } finally {
    // Finally, send the message_stop event
    const messageStop = { type: "message_stop" };
    write(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`);
    res.end();
  }
}