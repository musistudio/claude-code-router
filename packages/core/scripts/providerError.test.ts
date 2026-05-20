import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyProviderError } from "../src/api/providerError";

describe("classifyProviderError", () => {
  it("maps upstream context-window errors to a non-retryable 413", () => {
    const error = classifyProviderError(
      "openai-responses",
      "gpt-5.5",
      502,
      JSON.stringify({
        error: {
          message:
            "Your input exceeds the context window of this model. Please adjust your input and try again.",
          type: "upstream_error",
        },
      })
    );

    assert.equal(error.statusCode, 413);
    assert.equal(error.code, "context_length_exceeded");
    assert.match(error.message, /Reduce the conversation\/tool context/);
    assert.match(error.message, /Router\.longContext/);
  });

  it("preserves ordinary provider failures", () => {
    const error = classifyProviderError(
      "openai-responses",
      "gpt-5.5",
      502,
      "bad gateway"
    );

    assert.equal(error.statusCode, 502);
    assert.equal(error.code, "provider_response_error");
    assert.match(error.message, /Error from provider/);
  });
});
