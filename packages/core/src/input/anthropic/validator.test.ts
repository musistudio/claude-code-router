import { describe, it, expect } from "vitest";
import {
  validateAnthropicRequest,
  ValidationError,
} from "./validator";

describe("validateAnthropicRequest", () => {
  // --- Valid requests ---

  it("accepts a minimal valid request", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts content as array of text blocks", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts thinking blocks (Claude Code 2.1.x interleaved-thinking)", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Let me analyze this..." },
              { type: "text", text: "Here is my response." },
            ],
          },
          { role: "user", content: "Follow up" },
        ],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts redacted_thinking blocks (redact-thinking)", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "assistant",
            content: [
              { type: "redacted_thinking", data: "encrypted-data-here" },
              { type: "text", text: "Response after redacted thinking." },
            ],
          },
        ],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts tool_use and tool_result blocks", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_01abc",
                name: "get_weather",
                input: { city: "SF" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01abc",
                content: "Sunny, 72F",
              },
            ],
          },
        ],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts image blocks", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "iVBORw0KGgo=",
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts system as array", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        system: [{ type: "text", text: "You are a helpful assistant." }],
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  it("accepts tools", () => {
    expect(
      validateAnthropicRequest({
        model: "claude-sonnet-4-20250514",
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: { type: "object", properties: {} },
          },
        ],
        messages: [{ role: "user", content: "Weather?" }],
        max_tokens: 1024,
      })
    ).toBe(true);
  });

  // --- Invalid requests ---

  it("rejects non-object request", () => {
    expect(() => validateAnthropicRequest(null)).toThrow(ValidationError);
    expect(() => validateAnthropicRequest("string")).toThrow(ValidationError);
  });

  it("rejects missing model", () => {
    expect(() =>
      validateAnthropicRequest({ messages: [] })
    ).toThrow(ValidationError);
  });

  it("rejects missing messages", () => {
    expect(() =>
      validateAnthropicRequest({ model: "claude" })
    ).toThrow(ValidationError);
  });

  it("rejects empty messages", () => {
    expect(() =>
      validateAnthropicRequest({ model: "claude", messages: [] })
    ).toThrow(ValidationError);
  });

  it("rejects invalid role", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [{ role: "system_admin", content: "hi" }],
      })
    ).toThrow(ValidationError);
  });

  it("rejects thinking block without thinking field", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [
          {
            role: "assistant",
            content: [{ type: "thinking" }],
          },
        ],
      })
    ).toThrow(/Thinking block.*must have thinking field/);
  });

  it("rejects redacted_thinking block without data field", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [
          {
            role: "assistant",
            content: [{ type: "redacted_thinking" }],
          },
        ],
      })
    ).toThrow(/Redacted thinking block.*must have data field/);
  });

  it("rejects tool_use without id", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [
          {
            role: "assistant",
            content: [{ type: "tool_use", name: "test", input: {} }],
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it("rejects tool_result without tool_use_id", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [
          {
            role: "user",
            content: [{ type: "tool_result", content: "result" }],
          },
        ],
      })
    ).toThrow(ValidationError);
  });

  it("rejects invalid max_tokens", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: -1,
      })
    ).toThrow(ValidationError);
  });

  it("rejects invalid temperature", () => {
    expect(() =>
      validateAnthropicRequest({
        model: "claude",
        messages: [{ role: "user", content: "hi" }],
        temperature: 2,
      })
    ).toThrow(ValidationError);
  });

  // --- Forward compatibility ---

  it("allows unknown block types (forward-compatible)", () => {
    expect(
      validateAnthropicRequest({
        model: "claude",
        messages: [
          {
            role: "user",
            content: [{ type: "future_block_type", data: "whatever" }],
          },
        ],
      })
    ).toBe(true);
  });
});
