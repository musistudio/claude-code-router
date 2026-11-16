import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultAppConfig } from "@ccr/core/config/default-config.ts";
import {
  ccrRoutedModelHeader,
  ccrRouterRouteResolverKey
} from "@ccr/core/gateway/core-runtime/router-plugin-contract.ts";
import { createGatewayPlugin } from "@ccr/core/gateway/core-runtime/router-plugin.ts";
import { hoistAnthropicToolResultImages } from "@ccr/core/gateway/features/anthropic-tool-result-images.ts";
import { calculateTokenCount } from "@ccr/core/routing/token-estimator.ts";

function fakePngBase64(width, height, tailChars = 0) {
  const ihdr = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
  ihdr.writeUInt32BE(13, 8);
  ihdr.write("IHDR", 12, "ascii");
  ihdr.writeUInt32BE(width, 16);
  ihdr.writeUInt32BE(height, 20);
  return ihdr.toString("base64") + "A".repeat(tailChars);
}

test("hoistAnthropicToolResultImages lifts image-only tool_result blocks into top-level user images", () => {
  const pngData = fakePngBase64(1200, 800, 4096);
  const body = {
    model: "Google Gemini/gemini-4-argon",
    messages: [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_read_1", name: "Read", input: { file_path: "/tmp/ui.png" } }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_read_1",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: pngData
                }
              }
            ]
          }
        ]
      }
    ]
  };

  const transformed = hoistAnthropicToolResultImages(body);

  assert.equal(transformed.changed, true);
  assert.equal(transformed.hoistedImageCount, 1);
  const userContent = transformed.value.messages[1].content;
  assert.equal(userContent.length, 2);
  assert.deepEqual(userContent[0], {
    type: "tool_result",
    tool_use_id: "call_read_1",
    content: [
      {
        type: "text",
        text: "[Image returned by tool call call_read_1 is attached in this user message as image #1.]"
      }
    ]
  });
  assert.deepEqual(userContent[1], {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: pngData
    }
  });
  assert.equal(JSON.stringify(userContent[0]).includes(pngData.slice(0, 64)), false);
});

test("hoistAnthropicToolResultImages preserves text, tool_reference, is_error, and multi-image ordering", () => {
  const firstPng = fakePngBase64(800, 600, 128);
  const secondPng = fakePngBase64(1024, 768, 128);
  const thirdPng = fakePngBase64(640, 480, 128);

  const body = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: firstPng }
          },
          {
            type: "tool_result",
            tool_use_id: "call_mcp_shot",
            is_error: false,
            content: [
              { type: "text", text: "[Image resized to 1024x768]" },
              { type: "tool_reference", tool_name: "mcp__playwright__screenshot" },
              { type: "image", source: { type: "base64", media_type: "image/png", data: secondPng } }
            ]
          },
          {
            type: "tool_result",
            tool_use_id: "call_read_3",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: thirdPng } },
              { type: "image", source: { type: "url", url: "https://example.test/preview.webp" } }
            ]
          }
        ]
      }
    ]
  };

  const transformed = hoistAnthropicToolResultImages(body);

  assert.equal(transformed.changed, true);
  assert.equal(transformed.hoistedImageCount, 3);
  const content = transformed.value.messages[0].content;
  assert.equal(content.length, 6);
  assert.equal(content[0].type, "image");
  assert.deepEqual(content[1], {
    type: "tool_result",
    tool_use_id: "call_mcp_shot",
    is_error: false,
    content: [
      { type: "text", text: "[Image resized to 1024x768]" },
      { type: "tool_reference", tool_name: "mcp__playwright__screenshot" },
      {
        type: "text",
        text: "[Image returned by tool call call_mcp_shot is attached in this user message as image #2.]"
      }
    ]
  });
  assert.equal(content[2].source.data, secondPng);
  assert.deepEqual(content[3], {
    type: "tool_result",
    tool_use_id: "call_read_3",
    content: [
      {
        type: "text",
        text: "[2 images returned by tool call call_read_3 are attached in this user message as images #3-#4.]"
      }
    ]
  });
  assert.equal(content[4].source.data, thirdPng);
  assert.equal(content[5].source.url, "https://example.test/preview.webp");
});

test("hoistAnthropicToolResultImages leaves text-only tool results untouched without cloning", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_text",
            content: [{ type: "text", text: "plain output" }]
          }
        ]
      }
    ]
  };

  const transformed = hoistAnthropicToolResultImages(body);

  assert.equal(transformed.changed, false);
  assert.equal(transformed.hoistedImageCount, 0);
  assert.equal(transformed.value, body);
});

test("CCR route resolver hoists tool_result images for non-Anthropic targets and preserves native Anthropic passthrough", async () => {
  const pngData = fakePngBase64(1000, 750, 512);
  const config = createDefaultAppConfig();
  config.Providers = [
    {
      id: "google-gemini",
      name: "Google Gemini",
      type: "gemini_generate_content",
      api_base_url: "https://generativelanguage.googleapis.com",
      models: ["gemini-4-argon"]
    },
    {
      id: "qwen",
      name: "QwenTokenPlan",
      type: "openai_chat_completions",
      api_base_url: "https://example.test/compatible-mode/v1",
      models: ["qwen3.8-max"]
    },
    {
      id: "anthropic-native",
      name: "AnthropicNative",
      type: "anthropic_messages",
      api_base_url: "https://example.test/anthropic",
      models: ["claude-sonnet-5-5"]
    }
  ];

  const plugin = await createGatewayPlugin({ plugin: { config: { appConfig: config } } });
  const resolver = plugin.routeResolvers.find((item) => item.key === ccrRouterRouteResolverKey);

  const makeBody = (model) => ({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_img",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: pngData } }
            ]
          }
        ]
      }
    ]
  });

  for (const selector of ["Google Gemini/gemini-4-argon", "QwenTokenPlan/qwen3.8-max"]) {
    const resolved = resolver.resolve({
      request: {
        headers: { [ccrRoutedModelHeader]: selector },
        method: "POST",
        url: "/v1/messages"
      },
      requestBody: makeBody(selector)
    });
    const content = resolved.requestBody.messages[0].content;
    assert.equal(content.length, 2, selector);
    assert.equal(content[0].type, "tool_result", selector);
    assert.equal(content[1].type, "image", selector);
    assert.equal(JSON.stringify(content[0]).includes(pngData.slice(0, 64)), false, selector);
  }

  const nativeSelector = "AnthropicNative/claude-sonnet-5-5";
  const nativeResolved = resolver.resolve({
    request: {
      headers: { [ccrRoutedModelHeader]: nativeSelector },
      method: "POST",
      url: "/v1/messages"
    },
    requestBody: makeBody(nativeSelector)
  });
  const nativeContent = nativeResolved.requestBody.messages[0].content;
  assert.equal(nativeContent.length, 1);
  assert.equal(nativeContent[0].type, "tool_result");
  assert.equal(nativeContent[0].content[0].type, "image");
  assert.equal(nativeContent[0].content[0].source.data, pngData);
});

test("calculateTokenCount estimates vision tokens for Base64 images without scanning payload as text", (t) => {
  const largePayload = fakePngBase64(1200, 800, 500_000).replace(/A/g, (ch, idx) => (idx % 17 === 0 ? "+" : ch));
  let regexScansOnBase64 = 0;
  const originalMatch = String.prototype.match;
  t.mock.method(String.prototype, "match", function (...args) {
    if (this.length > 10_000) {
      regexScansOnBase64 += 1;
    }
    return originalMatch.apply(this, args);
  });

  const tokens = calculateTokenCount([
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call_img",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: largePayload } }
          ]
        }
      ]
    }
  ], undefined, undefined);

  assert.equal(regexScansOnBase64, 0);
  // 1200 * 800 / 750 = 1280 vision tokens plus small wrapper key overhead (< 1350 total).
  assert.ok(tokens >= 1280 && tokens < 1350, `expected vision token estimate near 1280, got ${tokens}`);
});
