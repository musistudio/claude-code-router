import type { GatewayProviderProtocol } from "@ccr/core/contracts/app";

export function requestProtocolForPath(path: string): GatewayProviderProtocol | undefined {
  const normalized = path.toLowerCase();
  if (normalized === "/v1/messages" || normalized === "/messages" || normalized.endsWith("/v1/messages")) {
    return "anthropic_messages";
  }
  if (normalized === "/v1/chat/completions" || normalized === "/chat/completions" || normalized.endsWith("/chat/completions")) {
    return "openai_chat_completions";
  }
  if (normalized === "/v1/responses" || normalized === "/responses" || normalized.endsWith("/responses")) {
    return "openai_responses";
  }
  if (/\/v1(?:beta)?\/models\/[^/]+:(?:generatecontent|streamgeneratecontent)$/i.test(normalized)) {
    return "gemini_generate_content";
  }
  if (/\/v1(?:beta)?\/interactions(?:\/[^/]+(?:\/cancel)?)?$/i.test(normalized)) {
    return "gemini_interactions";
  }
  return undefined;
}

export function shouldApplyGatewayRouting(method: string, path: string): boolean {
  if (method.toUpperCase() !== "POST") {
    return false;
  }
  const protocol = requestProtocolForPath(path);
  if (protocol === "gemini_interactions") {
    return /\/v1(?:beta)?\/interactions$/i.test(path);
  }
  return Boolean(protocol);
}
