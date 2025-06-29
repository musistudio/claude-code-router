import { Request, Response, NextFunction } from "express";
import { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages";
import OpenAI from "openai";
import { log } from "../utils/log";

export const formatRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let {
    model,
    messages,
    system = [],
    temperature,
    tools,
    stream,
  }: MessageCreateParamsBase = req.body;
  log("formatRequest (original)", req.body);

  try {
    // 既存のメッセージ変換ロジックを維持
    const openAIMessages = Array.isArray(messages)
      ? messages.flatMap((anthropicMessage) => {
          // ... (この部分は元のコードと同じなため、簡潔にするために省略) ...
          const openAiMessagesFromThisAnthropicMessage = [];
          if (!Array.isArray(anthropicMessage.content)) {
            if (typeof anthropicMessage.content === "string") {
              openAiMessagesFromThisAnthropicMessage.push({
                role: anthropicMessage.role,
                content: anthropicMessage.content,
              });
            }
            return openAiMessagesFromThisAnthropicMessage;
          }
          if (anthropicMessage.role === "assistant") {
            const assistantMessage: any = { role: "assistant", content: null };
            let textContent = "";
            const toolCalls: any[] = [];
            anthropicMessage.content.forEach((contentPart) => {
              if (contentPart.type === "text") {
                textContent += (typeof contentPart.text === "string" ? contentPart.text : JSON.stringify(contentPart.text)) + "\n";
              } else if (contentPart.type === "tool_use") {
                toolCalls.push({
                  id: contentPart.id,
                  type: "function",
                  function: {
                    name: contentPart.name,
                    arguments: JSON.stringify(contentPart.input),
                  },
                });
              }
            });
            const trimmedTextContent = textContent.trim();
            if (trimmedTextContent.length > 0) assistantMessage.content = trimmedTextContent;
            if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
            if (assistantMessage.content || (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0)) {
              openAiMessagesFromThisAnthropicMessage.push(assistantMessage);
            }
          } else if (anthropicMessage.role === "user") {
            let userTextMessageContent = "";
            const subsequentToolMessages: any[] = [];
            anthropicMessage.content.forEach((contentPart) => {
              if (contentPart.type === "text") {
                userTextMessageContent += (typeof contentPart.text === "string" ? contentPart.text : JSON.stringify(contentPart.text)) + "\n";
              } else if (contentPart.type === "tool_result") {
                subsequentToolMessages.push({
                  role: "tool",
                  tool_call_id: contentPart.tool_use_id,
                  content: typeof contentPart.content === "string" ? contentPart.content : JSON.stringify(contentPart.content),
                });
              }
            });
            const trimmedUserText = userTextMessageContent.trim();
            if (trimmedUserText.length > 0) {
              openAiMessagesFromThisAnthropicMessage.push({ role: "user", content: trimmedUserText });
            }
            openAiMessagesFromThisAnthropicMessage.push(...subsequentToolMessages);
          } else {
             let combinedContent = "";
            anthropicMessage.content.forEach((contentPart) => {
              if (contentPart.type === "text") {
                combinedContent += (typeof contentPart.text === "string" ? contentPart.text : JSON.stringify(contentPart.text)) + "\n";
              } else {
                combinedContent += JSON.stringify(contentPart) + "\n";
              }
            });
            const trimmedCombinedContent = combinedContent.trim();
            if (trimmedCombinedContent.length > 0) {
              openAiMessagesFromThisAnthropicMessage.push({ role: anthropicMessage.role, content: trimmedCombinedContent });
            }
          }
          return openAiMessagesFromThisAnthropicMessage;
        })
      : [];

    const systemText = Array.isArray(system) ? system.map(s => s.text).join('\n') : String(system);

    // Responses API 用にリクエストボディを再構築
    const newRequestBody = {
      model: model || process.env.OPENAI_MODEL,
      instructions: systemText,
      input: openAIMessages,
      tools: [{ type: "web_search_preview" }],
      stream: true,
      temperature: temperature,
    };

    req.body = newRequestBody;
    log("Formatted request for Responses API:", JSON.stringify(newRequestBody, null, 2));

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }

    next();

  } catch (error) {
    console.error("Error in formatRequest:", error);
    res.status(500).json({ error: (error as Error).message });
  }
};