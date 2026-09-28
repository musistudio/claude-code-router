import { test } from "node:test";
import assert from "node:assert";
import { Readable } from "node:stream";
import { createTokenUsageInjectionStream } from "../../../src/gateway/features/token-usage-injection.ts";

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test("Anthropic messages protocol injects usage when missing", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Hello world" }],
    model: "claude-3-5-sonnet-20241022"
  }));

  const sseResponse = [
    'event: message_start',
    'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10,"output_tokens":0}}}',
    '',
    '',
    'event: content_block_start',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    '',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
    '',
    '',
    'event: content_block_delta',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}',
    '',
    '',
    'event: content_block_stop',
    'data: {"type":"content_block_stop","index":0}',
    '',
    '',
    'event: message_delta',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{}}',
    '',
    '',
    'event: message_stop',
    'data: {"type":"message_stop"}',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "anthropic_messages");
  const output = await streamToString(injected);

  assert.ok(output.includes('"input_tokens"'), "Should include input_tokens");
  assert.ok(output.includes('"output_tokens"'), "Should include output_tokens");
  
  const messageDeltaMatch = output.match(/event: message_delta\ndata: (.+)/);
  assert.ok(messageDeltaMatch, "Should find message_delta event");
  
  const messageDelta = JSON.parse(messageDeltaMatch[1]);
  assert.ok(messageDelta.usage.input_tokens > 0, "Should have positive input tokens");
  assert.ok(messageDelta.usage.output_tokens > 0, "Should have positive output tokens");
});

test("OpenAI chat completions protocol injects usage chunk before [DONE]", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    '',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_chat_completions");
  const output = await streamToString(injected);

  assert.ok(output.includes('"usage"'), "Should inject a usage chunk");
  
  const usageIndex = output.indexOf('"usage"');
  const doneIndex = output.indexOf('[DONE]');
  assert.ok(usageIndex > 0 && usageIndex < doneIndex, "Usage chunk should appear before [DONE]");
  
  const lines = output.split(/\r?\n/);
  const usageLine = lines.find(line => line.startsWith('data: ') && line.includes('"usage"'));
  assert.ok(usageLine, "Should have a data line with usage");
  
  const usageData = usageLine.substring(6);
  const usageChunk = JSON.parse(usageData);
  assert.ok(usageChunk.usage, "Should have usage object");
  assert.ok(usageChunk.usage.prompt_tokens > 0, "Should have prompt_tokens");
  assert.ok(usageChunk.usage.completion_tokens > 0, "Should have completion_tokens");
  assert.ok(usageChunk.usage.total_tokens > 0, "Should have total_tokens");
});

test("OpenAI chat completions does not inject when usage already present", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Hello" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}',
    '',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_chat_completions");
  const output = await streamToString(injected);

  const usageMatches = [...output.matchAll(/"usage":\{[^}]+\}/g)];
  assert.equal(usageMatches.length, 1, "Should have exactly one usage object (the original, no injection)");
});

test("OpenAI responses protocol injects usage in response.done event", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    input: [{ role: "user", content: "Hello" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'event: response.text.delta',
    'data: {"type":"response.text.delta","value":"Hi"}',
    '',
    '',
    'event: response.text.delta',
    'data: {"type":"response.text.delta","value":" there"}',
    '',
    '',
    'event: response.done',
    'data: {"type":"response.done","response":{"id":"resp_123","usage":{}}}',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_responses");
  const output = await streamToString(injected);

  const responseDoneMatch = output.match(/event: response\.done\ndata: (.+)/);
  assert.ok(responseDoneMatch, "Should find response.done event");
  
  const responseDone = JSON.parse(responseDoneMatch[1]);
  assert.ok(responseDone.response.usage, "Should have usage in response");
  assert.ok(responseDone.response.usage.prompt_tokens > 0, "Should have prompt_tokens");
  assert.ok(responseDone.response.usage.completion_tokens > 0, "Should have completion_tokens");
  assert.ok(responseDone.response.usage.total_tokens > 0, "Should have total_tokens");
});

test("Token injection handles reasoning/thinking content", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "What is 2+2?" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"reasoning":"Let me think..."},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"The answer is 4"},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    '',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_chat_completions");
  const output = await streamToString(injected);

  assert.ok(output.includes('"usage"'), "Should inject usage chunk");
  
  const lines = output.split(/\r?\n/);
  const usageLine = lines.find(line => line.startsWith('data: ') && line.includes('"usage"'));
  assert.ok(usageLine, "Should have a data line with usage");
  
  const usageData = usageLine.substring(6);
  const usageChunk = JSON.parse(usageData);
  assert.ok(usageChunk.usage.completion_tokens > 10, "Should count reasoning content in tokens");
});

test("Token injection handles tool calls", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Call a function" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_abc","type":"function","function":{"name":"test_func","arguments":"{\\"arg\\":"}}]},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value\\"}"}}]},"finish_reason":null}]}',
    '',
    '',
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
    '',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_chat_completions");
  const output = await streamToString(injected);

  assert.ok(output.includes('"usage"'), "Should inject usage chunk");
  
  const lines = output.split(/\r?\n/);
  const usageLine = lines.find(line => line.startsWith('data: ') && line.includes('"usage"'));
  assert.ok(usageLine, "Should have a data line with usage");
  
  const usageData = usageLine.substring(6);
  const usageChunk = JSON.parse(usageData);
  assert.ok(usageChunk.usage.completion_tokens > 5, "Should count tool call arguments in tokens");
});

test("Token injection handles CRLF line endings", async () => {
  const requestBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Test" }],
    model: "gpt-4o"
  }));

  const sseResponse = [
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
    '',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\r\n');

  const input = Readable.from([sseResponse]);
  const injected = createTokenUsageInjectionStream(input, requestBody, "openai_chat_completions");
  const output = await streamToString(injected);

  assert.ok(output.includes('"usage"'), "Should inject usage with CRLF endings");
  assert.ok(output.includes('[DONE]'), "Should preserve [DONE] marker");
});
