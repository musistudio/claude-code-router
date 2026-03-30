import { FastifyRequest, FastifyReply } from "fastify";

export interface ApiError extends Error {
  statusCode?: number;
  code?: ErrorCode;
  type?: string;
}

/**
 * Error codes used in the application
 */
export const ErrorCodes = {
  INTERNAL_ERROR: "internal_error",
  PROVIDER_RESPONSE_ERROR: "provider_response_error",
  EMPTY_STREAM_ERROR: "empty_stream_error",
  INVALID_REQUEST: "invalid_request",
  PROVIDER_NOT_FOUND: "provider_not_found",
  PROVIDER_EXISTS: "provider_exists",
  PROVIDER_ERROR: "provider_error",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export function createApiError(
  message: string,
  statusCode: number = 500,
  code: ErrorCode = "internal_error",
  type: string = "api_error"
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.type = type;
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
      message: error.message + error.stack || "Internal Server Error",
      type: error.type || "api_error",
      code: error.code || "internal_error",
    },
  };

  return reply.code(statusCode).send(response);
}
