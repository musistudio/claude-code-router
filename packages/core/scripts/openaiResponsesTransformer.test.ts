import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAIResponsesTransformer } from "../src/transformer/openai.responses.transformer";

const readStream = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
};

const parseSseData = (output: string) =>
  output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length).trim())
    .filter((line) => line && line !== "[DONE]")
    .map((line) => JSON.parse(line));

describe("OpenAIResponsesTransformer", () => {
  it("preserves streaming usage from response.completed", async () => {
    const upstream = [
      {
        type: "response.completed",
        response: {
          id: "resp_123",
          model: "gpt-5.5",
          output: [{ type: "message" }],
          usage: {
            input_tokens: 12345,
            output_tokens: 67,
            total_tokens: 12412,
          },
        },
      },
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");

    const response = new Response(upstream, {
      headers: { "Content-Type": "text/event-stream" },
    });

    const transformed =
      await new OpenAIResponsesTransformer().transformResponseOut(response);
    assert.ok(transformed.body);

    const chunks = parseSseData(await readStream(transformed.body));
    const doneChunk = chunks.find(
      (chunk) => chunk.choices?.[0]?.finish_reason === "stop"
    );

    assert.deepEqual(doneChunk?.usage, {
      prompt_tokens: 12345,
      completion_tokens: 67,
      total_tokens: 12412,
    });
  });
});
