import { describe, it, expect } from "vitest";
import {
  convertToAnthropic,
  convertToOpenAI,
  convertRequest,
  convertToolsToAnthropic,
  convertToolsFromAnthropic,
} from "./converter";
import { UnifiedChatRequest, UnifiedTool, ConversionOptions } from "../types/llm";

describe("converter", () => {
  describe("convertToAnthropic", () => {
    it("should convert system message to system field", () => {
      const req: UnifiedChatRequest = {
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        model: "test",
        max_tokens: 1024,
        stream: false,
      };
      const result = convertToAnthropic(req) as any;
      expect(result.system).toBe("You are helpful");
      expect(result.messages[0].role).toBe("user");
    });

    it("should convert tool_calls to tool_use content blocks", () => {
      const req: UnifiedChatRequest = {
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"NYC"}' },
            }],
          },
        ],
        model: "test",
        max_tokens: 1024,
        stream: false,
      };
      const result = convertToAnthropic(req) as any;
      const block = result.messages[0].content[0];
      expect(block.type).toBe("tool_use");
      expect(block.id).toBe("call_123");
      expect(block.name).toBe("get_weather");
      expect(block.input).toEqual({ city: "NYC" });
    });

    it("should convert tool response to tool_result content block", () => {
      const req: UnifiedChatRequest = {
        messages: [
          {
            role: "tool",
            content: "72°F, sunny",
            tool_call_id: "call_123",
          },
        ],
        model: "test",
        max_tokens: 1024,
        stream: false,
      };
      const result = convertToAnthropic(req) as any;
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content[0].type).toBe("tool_result");
      expect(result.messages[0].content[0].tool_use_id).toBe("call_123");
      expect(result.messages[0].content[0].content).toBe("72°F, sunny");
    });

    it("should convert unified tools to Anthropic format", () => {
      const tools: UnifiedTool[] = [{
        type: "function",
        function: {
          name: "bash",
          description: "Run a command",
          parameters: { type: "object", properties: { cmd: { type: "string" } } },
        },
      }];
      const result = convertToolsToAnthropic(tools);
      expect(result[0].name).toBe("bash");
      expect(result[0].input_schema).toBeDefined();
      expect(result[0].input_schema.properties.cmd).toBeDefined();
    });

    it("should handle assistant message with text and tool_calls", () => {
      const req: UnifiedChatRequest = {
        messages: [
          {
            role: "assistant",
            content: "Let me check that.",
            tool_calls: [{
              id: "call_456",
              type: "function",
              function: { name: "search", arguments: '{}' },
            }],
          },
        ],
        model: "test",
        max_tokens: 1024,
        stream: false,
      };
      const result = convertToAnthropic(req) as any;
      const content = result.messages[0].content;
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe("text");
      expect(content[0].text).toBe("Let me check that.");
      expect(content[1].type).toBe("tool_use");
    });

    it("should convert tool_choice string to Anthropic format", () => {
      const req: UnifiedChatRequest = {
        messages: [{ role: "user", content: "test" }],
        model: "test",
        max_tokens: 1024,
        stream: false,
        tool_choice: "auto",
        tools: [{
          type: "function",
          function: { name: "bash", description: "test", parameters: {} },
        }],
      };
      const result = convertToAnthropic(req) as any;
      expect(result.tool_choice).toEqual({ type: "auto" });
    });
  });

  describe("convertRequest", () => {
    it("should route to convertToAnthropic when target is anthropic", () => {
      const result = convertRequest(
        {
          messages: [{ role: "user", content: "Hello" }],
          model: "test",
          max_tokens: 1024,
          stream: false,
        } as UnifiedChatRequest,
        { sourceProvider: "openai", targetProvider: "anthropic" }
      ) as any;
      expect(result.messages).toBeDefined();
      expect(result.messages[0].role).toBe("user");
      expect(typeof result.messages[0].content).toBe("string");
    });
  });

  describe("convertToolsFromAnthropic", () => {
    it("should convert Anthropic tools to unified format", () => {
      const result = convertToolsFromAnthropic([{
        name: "bash",
        description: "Run command",
        input_schema: { type: "object", properties: {} },
      } as any]);
      expect(result[0].function.name).toBe("bash");
      expect(result[0].function.parameters).toBeDefined();
    });
  });
});
