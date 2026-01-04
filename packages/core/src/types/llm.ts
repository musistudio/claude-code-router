import type { ChatCompletionMessageParam as OpenAIMessage } from "openai/resources/chat/completions";
import type { MessageParam as AnthropicMessage } from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type {
  Message,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";
import { Transformer } from "./transformer";
import type { ProviderTokenizerConfig } from "./tokenizer";

export interface UrlCitation {
  url: string;
  title: string;
  content: string;
  start_index: number;
  end_index: number;
}
export interface Annotation {
  type: "url_citation";
  url_citation?: UrlCitation;
}

// 内容类型定义
export interface TextContent {
  type: "text";
  text: string;
  cache_control?: {
    type?: string;
  };
}

export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
  media_type: string;
}

export type MessageContent = TextContent | ImageContent;

// 统一的消息接口
export interface UnifiedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null | MessageContent[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  cache_control?: {
    type?: string;
  };
  thinking?: {
    content: string;
    signature?: string;
  };
}

// 统一的工具定义接口
export interface UnifiedTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
      $schema?: string;
    };
  };
}

export type ThinkLevel = "none" | "low" | "medium" | "high";

// 统一的请求接口
export interface UnifiedChatRequest {
  messages: UnifiedMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | string
    | { type: "function"; function: { name: string } };
  reasoning?: {
    // OpenAI-style
    effort?: ThinkLevel;

    // Anthropic-style
    max_tokens?: number;

    enabled?: boolean;
  };
}

// 统一的响应接口
export interface UnifiedChatResponse {
  id: string;
  model: string;
  content: string | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  annotations?: Annotation[];
}

// 流式响应相关类型
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      thinking?: {
        content?: string;
        signature?: string;
      };
      tool_calls?: Array<{
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
      annotations?: Annotation[];
    };
    finish_reason?: string | null;
  }>;
}

// Anthropic 流式事件类型
export type AnthropicStreamEvent = MessageStreamEvent;

// OpenAI 流式块类型
export type OpenAIStreamChunk = ChatCompletionChunk;

// OpenAI 特定类型
export interface OpenAIChatRequest {
  messages: OpenAIMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ChatCompletionTool[];
  tool_choice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
}

// Anthropic 特定类型
export interface AnthropicChatRequest {
  messages: AnthropicMessage[];
  model: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  system?: string;
  tools?: AnthropicTool[];
  tool_choice?: { type: "auto" } | { type: "tool"; name: string };
}

// 转换选项
export interface ConversionOptions {
  targetProvider: "openai" | "anthropic";
  sourceProvider: "openai" | "anthropic";
}

export interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  transformer?: {
    [key: string]: {
      use?: Transformer[];
    };
  } & {
    use?: Transformer[];
  };
}

export type RegisterProviderRequest = LLMProvider;

export interface ModelRoute {
  provider: string;
  model: string;
  fullModel: string;
}

export interface RequestRouteInfo {
  provider: LLMProvider;
  originalModel: string;
  targetModel: string;
}

export interface ConfigProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer: {
    use?: string[] | Array<any>[];
  } & {
    [key: string]: {
      use?: string[] | Array<any>[];
    };
  };
  tokenizer?: ProviderTokenizerConfig;
}
