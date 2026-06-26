import { test } from "node:test";
import assert from "node:assert/strict";
import { getMorphRouterDecision } from "./morph-router";

// Opt-in live contract test against the real Morph Router API. It is SKIPPED
// unless MORPH_API_KEY is set, so the default suite never makes a network call:
//
//   MORPH_API_KEY=sk-... npm test
//
// It verifies the request shape is accepted and the response carries a `model`
// that maps onto a configured route.

const apiKey = process.env.MORPH_API_KEY;
const allowed = ["claude-sonnet-4-6", "claude-opus-4-8", "deepseek-v4-flash"];

test("live Morph API returns a mapped model decision", { skip: !apiKey }, async () => {
  // Map every allowed Morph model onto a single dummy provider/model route so
  // whichever model Morph returns resolves to a valid target.
  const providers = [{ name: "test", models: ["model-a"] }];
  const models = Object.fromEntries(allowed.map((name) => [name, "test,model-a"]));

  const decision = await getMorphRouterDecision({
    rawConfig: {
      enabled: true,
      api_key: apiKey,
      policy: "balanced",
      default_model: "claude-sonnet-4-6",
      timeout_ms: 8000,
      models
    },
    providers,
    requestBody: {
      messages: [{ role: "user", content: "Refactor this large module and add unit tests for every branch." }]
    }
  });

  assert.ok(decision, "expected a routing decision from the live Morph API");
  assert.ok(allowed.includes(decision!.morphModel), `unexpected model: ${decision?.morphModel}`);
  assert.equal(decision!.target.route, "test,model-a");
});
