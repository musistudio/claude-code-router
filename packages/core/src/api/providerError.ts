export interface ProviderErrorClassification {
  message: string;
  statusCode: number;
  code: string;
}

const CONTEXT_LIMIT_PATTERNS = [
  /context window/i,
  /context length/i,
  /context_length_exceeded/i,
  /maximum context/i,
  /maximum.*tokens/i,
  /token limit/i,
  /too many tokens/i,
  /input exceeds.*context/i,
  /prompt is too long/i,
];

function parseProviderErrorMessage(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText);
    if (typeof parsed?.error?.message === "string") {
      return parsed.error.message;
    }
    if (typeof parsed?.message === "string") {
      return parsed.message;
    }
  } catch {
    // Fall through to the raw provider body.
  }

  return errorText;
}

export function classifyProviderError(
  providerName: string,
  modelName: string,
  upstreamStatus: number,
  errorText: string
): ProviderErrorClassification {
  const providerMessage = parseProviderErrorMessage(errorText);
  const isContextLimitError = CONTEXT_LIMIT_PATTERNS.some((pattern) =>
    pattern.test(providerMessage)
  );

  if (isContextLimitError) {
    return {
      message:
        `Request exceeds the context window for provider(${providerName},${modelName}). ` +
        `Reduce the conversation/tool context or configure Router.longContext to use a larger-context model. ` +
        `Provider response(${upstreamStatus}): ${errorText}`,
      statusCode: 413,
      code: "context_length_exceeded",
    };
  }

  return {
    message: `Error from provider(${providerName},${modelName}: ${upstreamStatus}): ${errorText}`,
    statusCode: upstreamStatus,
    code: "provider_response_error",
  };
}
