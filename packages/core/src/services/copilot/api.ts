import { copilotBaseUrl, copilotHeaders } from "./api-config";

export interface ChatCompletionsPayload {
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string | Array<{ type: string; [key: string]: any }>;
    name?: string;
    tool_calls?: Array<{ id: string; type: "function"; function: any }>;
    tool_call_id?: string;
  }>;
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | Array<string>;
  n?: number;
  stream?: boolean;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: Array<{ type: "function"; function: any }>;
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: any };
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string; role?: string };
    finish_reason: string | null;
  }>;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function createChatCompletions(
  accountType: string,
  copilotToken: string,
  payload: ChatCompletionsPayload,
  vsCodeVersion?: string
): Promise<AsyncIterable<ChatCompletionChunk> | ChatCompletionResponse> {
  const hasImages = payload.messages.some(
    (msg) =>
      Array.isArray(msg.content) &&
      msg.content.some((part) => part.type === "image_url")
  );

  const isAgentCall = payload.messages.some((msg) =>
    ["assistant", "tool"].includes(msg.role)
  );

  const headers = {
    ...copilotHeaders(accountType, copilotToken, hasImages, vsCodeVersion),
    "X-Initiator": isAgentCall ? "agent" : "user",
  };

  const response = await fetch(
    `${copilotBaseUrl(accountType)}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(`Copilot API error: ${response.status}`);
  }

  if (payload.stream) {
    return streamChatCompletions(response);
  }

  return response.json();
}

async function* streamChatCompletions(
  response: Response
): AsyncIterable<ChatCompletionChunk> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          yield JSON.parse(data);
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

export async function getModels(
  accountType: string,
  copilotToken: string,
  vsCodeVersion?: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(`${copilotBaseUrl(accountType)}/models`, {
    headers: copilotHeaders(accountType, copilotToken, false, vsCodeVersion),
  });

  if (!response.ok) {
    throw new Error(`Failed to get models: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}
