import { FastifyRequest, FastifyReply } from "fastify";

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  type?: string;
}

export function createApiError(
  message: string,
  statusCode: number = 500,
  code: string = "internal_error",
  type: string = "api_error"
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.type = type;
  return error;
}

// Map HTTP status codes to Anthropic error types
function toAnthropicErrorType(statusCode: number, code?: string): string {
  if (code === "provider_response_error") {
    if (statusCode === 429) return "rate_limit_error";
    if (statusCode === 401) return "authentication_error";
    if (statusCode === 403) return "permission_error";
    if (statusCode === 404) return "not_found_error";
    if (statusCode === 529) return "overloaded_error";
  }
  if (statusCode === 400) return "invalid_request_error";
  if (statusCode === 401) return "authentication_error";
  if (statusCode === 403) return "permission_error";
  if (statusCode === 404) return "not_found_error";
  if (statusCode === 429) return "rate_limit_error";
  return "api_error";
}

export async function errorHandler(
  error: ApiError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  const statusCode = error.statusCode || 500;

  // Return Anthropic-compatible error format so Claude Code SDK can handle it properly.
  // A non-standard format causes the SDK to try parsing the response as a normal message,
  // which leads to "Cannot read properties of undefined (reading 'input_tokens')".
  const response = {
    type: "error",
    error: {
      type: toAnthropicErrorType(statusCode, error.code),
      message: error.message || "Internal Server Error",
    },
  };

  return reply.code(statusCode).send(response);
}
