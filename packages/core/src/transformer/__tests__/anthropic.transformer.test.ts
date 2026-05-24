import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn() };
});

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { AnthropicTransformer } from "../anthropic.transformer";
import type { LLMProvider } from "@/types/llm";

const mockReadFileSync = vi.mocked(readFileSync);
const mockExecFileSync = vi.mocked(execFileSync);

const provider = (overrides: Partial<LLMProvider> = {}): LLMProvider =>
  ({
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1/messages",
    apiKey: "sk-from-config",
    models: ["claude-sonnet-4-6"],
    ...overrides,
  }) as LLMProvider;

const fsNotFound = () => {
  const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  throw err;
};

const keychainMissing = () => {
  throw new Error("keychain unavailable");
};

beforeEach(() => {
  delete process.env.CCR_OAUTH_TOKEN;
  mockReadFileSync.mockImplementation(fsNotFound);
  mockExecFileSync.mockImplementation(keychainMissing);
});

describe("AnthropicTransformer.auth", () => {
  describe("default (x-api-key)", () => {
    it("sends x-api-key with the provider apiKey and no Authorization header", async () => {
      const t = new AnthropicTransformer();
      const result = await t.auth({}, provider({ apiKey: "sk-abc" }));
      expect(result.config.headers).toEqual({
        "x-api-key": "sk-abc",
        authorization: undefined,
      });
    });
  });

  describe("UseBearer", () => {
    it("sends Authorization: Bearer <apiKey> and clears x-api-key", async () => {
      const t = new AnthropicTransformer({ UseBearer: true });
      const result = await t.auth({}, provider({ apiKey: "sk-abc" }));
      expect(result.config.headers).toEqual({
        authorization: "Bearer sk-abc",
        "x-api-key": undefined,
      });
    });
  });

  describe("OAuth", () => {
    it("uses CCR_OAUTH_TOKEN when set (highest priority)", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok-env";
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ claudeAiOauth: { accessToken: "tok-file" } })
      );

      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider());

      expect(result.config.headers.authorization).toBe("Bearer tok-env");
      expect(result.config.headers["x-api-key"]).toBeUndefined();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("falls back to ~/.claude/.credentials.json when no env token", async () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ claudeAiOauth: { accessToken: "tok-file" } })
      );

      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider());

      expect(result.config.headers.authorization).toBe("Bearer tok-file");
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("falls back to macOS Keychain when env + file are unavailable", async () => {
      mockExecFileSync.mockReturnValue(
        JSON.stringify({ claudeAiOauth: { accessToken: "tok-keychain" } })
      );

      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider());

      expect(result.config.headers.authorization).toBe("Bearer tok-keychain");
    });

    it("falls back to provider.apiKey as last resort", async () => {
      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider({ apiKey: "sk-config" }));
      expect(result.config.headers.authorization).toBe("Bearer sk-config");
    });

    it("appends oauth-2025-04-20 to existing anthropic-beta header", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok";
      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider(), {
        headers: { "anthropic-beta": "feature-x,feature-y" },
      });
      const beta = (result.config.headers["anthropic-beta"] as string).split(",");
      expect(beta).toEqual(
        expect.arrayContaining(["feature-x", "feature-y", "oauth-2025-04-20"])
      );
      expect(beta).toHaveLength(3);
    });

    it("sets anthropic-beta to oauth-2025-04-20 when no prior header", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok";
      const t = new AnthropicTransformer({ OAuth: true });
      const result = await t.auth({}, provider());
      expect(result.config.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
    });

    it("strips disallowed top-level fields from the request", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok";
      const req: Record<string, any> = {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
        // disallowed:
        user: "shouldGo",
        custom_field: "shouldGo",
      };

      const t = new AnthropicTransformer({ OAuth: true });
      await t.auth(req, provider());

      expect(req).toEqual({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
      });
    });

    it("filters non-'type' keys from cache_control objects (deeply)", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok";
      const req: Record<string, any> = {
        model: "claude-sonnet-4-6",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "hi",
                cache_control: { type: "ephemeral", ttl: "1h" },
              },
            ],
          },
        ],
      };

      const t = new AnthropicTransformer({ OAuth: true });
      await t.auth(req, provider());

      expect(req.messages[0].content[0].cache_control).toEqual({
        type: "ephemeral",
      });
    });

    it.each([
      ["context omitted entirely", undefined],
      ["context provided but headers missing", {}],
      ["context.headers present but anthropic-beta missing", { headers: {} }],
    ])(
      "tolerates missing context shape (%s) and still sets oauth beta header",
      async (_label, contextArg) => {
        process.env.CCR_OAUTH_TOKEN = "tok";
        const t = new AnthropicTransformer({ OAuth: true });
        const result = await t.auth({}, provider(), contextArg as any);
        expect(result.config.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
        expect(result.config.headers.authorization).toBe("Bearer tok");
      }
    );

    it("caches the resolved token for ~60s (no re-read on second call)", async () => {
      process.env.CCR_OAUTH_TOKEN = "tok";
      const t = new AnthropicTransformer({ OAuth: true });

      await t.auth({}, provider());
      await t.auth({}, provider());

      // env-var resolution doesn't touch fs/exec at all; just verify the
      // cache shortcircuits the resolver — second call shouldn't re-check
      // any fallback source either.
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });
  });
});

describe("AnthropicTransformer.transformRequestOut", () => {
  const t = new AnthropicTransformer();

  it("converts string system prompt into a system message", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      system: "you are helpful",
      messages: [],
    });
    expect(out.messages[0]).toEqual({ role: "system", content: "you are helpful" });
  });

  it("converts array system prompt and preserves cache_control on text parts", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      system: [
        { type: "text", text: "rule one", cache_control: { type: "ephemeral" } },
        { type: "text", text: "rule two" },
        { type: "image", source: {} }, // non-text, should be filtered out
      ],
      messages: [],
    });
    expect(out.messages[0]).toEqual({
      role: "system",
      content: [
        { type: "text", text: "rule one", cache_control: { type: "ephemeral" } },
        { type: "text", text: "rule two", cache_control: undefined },
      ],
    });
  });

  it("passes a user string message through unchanged", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hello" }],
    });
    expect(out.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts user image content to image_url with base64 data URI", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "iVBORw0KG" },
            },
          ],
        },
      ],
    });
    const userMsg = out.messages[0] as any;
    expect(userMsg.role).toBe("user");
    expect(userMsg.content[0]).toEqual({ type: "text", text: "describe this" });
    expect(userMsg.content[1]).toMatchObject({
      type: "image_url",
      image_url: { url: "data:image/png;base64,iVBORw0KG" },
      media_type: "image/png",
    });
  });

  it("emits a separate tool role message for each tool_result block", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: "result-text",
            },
            {
              type: "tool_result",
              tool_use_id: "tool-2",
              content: [{ type: "text", text: "structured" }],
            },
          ],
        },
      ],
    });
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0]).toMatchObject({
      role: "tool",
      content: "result-text",
      tool_call_id: "tool-1",
    });
    expect(out.messages[1]).toMatchObject({
      role: "tool",
      content: JSON.stringify([{ type: "text", text: "structured" }]),
      tool_call_id: "tool-2",
    });
  });

  it("joins assistant text parts and converts tool_use to tool_calls", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second" },
            {
              type: "tool_use",
              id: "tu-1",
              name: "search",
              input: { q: "ts" },
            },
          ],
        },
      ],
    });
    const msg = out.messages[0] as any;
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("first\nsecond");
    expect(msg.tool_calls).toEqual([
      {
        id: "tu-1",
        type: "function",
        function: { name: "search", arguments: JSON.stringify({ q: "ts" }) },
      },
    ]);
  });

  it("preserves assistant thinking block (content + signature)", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reasoning here", signature: "sig-xyz" },
            { type: "text", text: "answer" },
          ],
        },
      ],
    });
    const msg = out.messages[0] as any;
    expect(msg.thinking).toEqual({ content: "reasoning here", signature: "sig-xyz" });
    expect(msg.content).toBe("answer");
  });

  it("maps Anthropic tools to unified function tools", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [],
      tools: [
        {
          name: "search",
          description: "search the web",
          input_schema: { type: "object", properties: { q: { type: "string" } } },
        },
      ],
    });
    expect(out.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "search the web",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ]);
  });

  it("maps thinking config to reasoning with effort + enabled flag", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [],
      thinking: { type: "enabled", budget_tokens: 10000 },
    });
    expect(out.reasoning).toMatchObject({ enabled: true });
    expect(out.reasoning?.effort).toBeDefined();
  });

  it.each([
    [{ type: "auto" }, "auto"],
    [{ type: "any" }, "any"],
  ])("maps tool_choice %j to %s", async (input, expected) => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [],
      tool_choice: input,
    });
    expect(out.tool_choice).toBe(expected);
  });

  it("maps tool_choice {type:'tool', name} to function form", async () => {
    const out = await t.transformRequestOut({
      model: "claude-sonnet-4-6",
      messages: [],
      tool_choice: { type: "tool", name: "search" },
    });
    expect(out.tool_choice).toEqual({
      type: "function",
      function: { name: "search" },
    });
  });
});

describe("AnthropicTransformer.transformResponseIn (non-stream)", () => {
  const makeContext = () => ({ req: { id: "test-req" } }) as any;
  const makeJsonResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });

  const newTransformer = () => {
    const t = new AnthropicTransformer();
    (t as any).logger = { debug: vi.fn() };
    return t;
  };

  it("converts a plain text completion into a single text content block", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-1",
      model: "claude-sonnet-4-6",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "hello there" },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const result = await t.transformResponseIn(openaiResponse, makeContext());
    const body = await result.json();

    expect(body).toMatchObject({
      id: "cmpl-1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [{ type: "text", text: "hello there" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    });
  });

  it("converts tool_calls into tool_use content blocks with parsed arguments", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-2",
      model: "claude-sonnet-4-6",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call-1",
                function: { name: "search", arguments: JSON.stringify({ q: "ts" }) },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
    });

    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();

    expect(body.stop_reason).toBe("tool_use");
    expect(body.content).toEqual([
      { type: "tool_use", id: "call-1", name: "search", input: { q: "ts" } },
    ]);
  });

  it("falls back to {text: <raw>} when tool_call arguments are unparseable", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-3",
      model: "claude-sonnet-4-6",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call-x", function: { name: "noop", arguments: "{not-json" } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();

    expect(body.content[0].input).toEqual({ text: "{not-json" });
  });

  it("emits a thinking block when the message carries thinking metadata", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-4",
      model: "claude-sonnet-4-6",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "answer",
            thinking: { content: "reasoning", signature: "sig" },
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();

    expect(body.content).toContainEqual({
      type: "thinking",
      thinking: "reasoning",
      signature: "sig",
    });
  });

  it("translates annotations into server_tool_use + web_search_tool_result blocks", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-5",
      model: "claude-sonnet-4-6",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "see refs",
            annotations: [
              { url_citation: { url: "https://a", title: "A" } },
              { url_citation: { url: "https://b", title: "B" } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();

    const serverToolUse = body.content.find((c: any) => c.type === "server_tool_use");
    const webResult = body.content.find((c: any) => c.type === "web_search_tool_result");

    expect(serverToolUse).toMatchObject({ name: "web_search" });
    expect(webResult.tool_use_id).toBe(serverToolUse.id);
    expect(webResult.content).toEqual([
      { type: "web_search_result", url: "https://a", title: "A" },
      { type: "web_search_result", url: "https://b", title: "B" },
    ]);
  });

  it.each([
    ["stop", "end_turn"],
    ["length", "max_tokens"],
    ["tool_calls", "tool_use"],
    ["content_filter", "stop_sequence"],
    ["unknown_value", "end_turn"],
  ])("maps finish_reason '%s' → stop_reason '%s'", async (finish, stop) => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-fr",
      model: "claude-sonnet-4-6",
      choices: [
        { finish_reason: finish, message: { role: "assistant", content: "x" } },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();
    expect(body.stop_reason).toBe(stop);
  });

  it("subtracts cached tokens from input_tokens and surfaces cache_read_input_tokens", async () => {
    const t = newTransformer();
    const openaiResponse = makeJsonResponse({
      id: "cmpl-cache",
      model: "claude-sonnet-4-6",
      choices: [
        { finish_reason: "stop", message: { role: "assistant", content: "ok" } },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 30 },
      },
    });
    const body = await (await t.transformResponseIn(openaiResponse, makeContext())).json();
    expect(body.usage).toEqual({
      input_tokens: 70,
      output_tokens: 20,
      cache_read_input_tokens: 30,
    });
  });
});
