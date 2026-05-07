import { FastifyRequest, FastifyReply } from "fastify";

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  type?: string;
  headers?: Record<string, string>;
}

export function createApiError(
  message: string,
  statusCode: number = 500,
  code: string = "internal_error",
  type: string = "api_error",
  headers?: Record<string, string>
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.type = type;
  if (headers) error.headers = headers;
  return error;
}

export async function errorHandler(
  error: ApiError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  const statusCode = error.statusCode || 500;
  const response = {
    error: {
      message: error.message + (error.stack ? "\n" + error.stack : ""),
      type: error.type || "api_error",
      code: error.code || "internal_error",
    },
  };

  if (error.headers) {
    reply.headers(error.headers);
  }

  // Reset Content-Type to application/json to prevent "invalid payload type" errors
  // when the reply previously had Content-Type set to a non-JSON value (e.g., text/event-stream
  // from a streaming response that failed before the stream was sent).
  reply.header("Content-Type", "application/json");

  return reply.code(statusCode).send(response);
}
