export type JsonObjectSchema = {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  $schema?: string;
};

export function normalizeToolInputSchema(
  toolName: string,
  inputSchema: unknown
): JsonObjectSchema {
  if (isObjectSchema(inputSchema)) {
    return inputSchema;
  }

  if (toolName === "WebSearch") {
    return {
      type: "object",
      properties: {
        query: { type: "string" },
        allowed_domains: {
          type: "array",
          items: { type: "string" },
        },
        blocked_domains: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["query"],
      additionalProperties: true,
    };
  }

  if (toolName === "WebFetch") {
    return {
      type: "object",
      properties: {
        url: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["url"],
      additionalProperties: true,
    };
  }

  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function isObjectSchema(value: unknown): value is JsonObjectSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as any).type === "object"
  );
}
