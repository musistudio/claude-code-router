import assert from "node:assert/strict";
import test from "node:test";
import { interpolateRawAppConfigEnvVars } from "../../packages/core/src/config/config.ts";

test("config env interpolation is limited to legacy JSON config", () => {
  const previous = process.env.CCR_ENV_INTERPOLATION_SECRET;
  process.env.CCR_ENV_INTERPOLATION_SECRET = "env-secret";

  try {
    const rawConfig = {
      Providers: [
        {
          account: {
            connectors: [
              {
                body: {
                  token: "${CCR_ENV_INTERPOLATION_SECRET}"
                },
                endpoint: "https://usage.example.com/account",
                headers: {
                  "x-env-secret": "$CCR_ENV_INTERPOLATION_SECRET"
                },
                mapping: {
                  meters: [
                    {
                      id: "balance",
                      kind: "balance",
                      remaining: "$.balance",
                      unit: "$CCR_ENV_INTERPOLATION_SECRET"
                    }
                  ]
                },
                type: "http-json"
              }
            ],
            enabled: true
          },
          api_key: "${CCR_ENV_INTERPOLATION_SECRET}",
          baseUrl: "https://api.example.com/v1",
          models: ["model"],
          name: "Remote"
        }
      ]
    };

    const sqliteConfig = interpolateRawAppConfigEnvVars(rawConfig, "sqlite");
    assert.equal(sqliteConfig.Providers[0].api_key, "${CCR_ENV_INTERPOLATION_SECRET}");
    assert.equal(sqliteConfig.Providers[0].account.connectors[0].headers["x-env-secret"], "$CCR_ENV_INTERPOLATION_SECRET");
    assert.equal(sqliteConfig.Providers[0].account.connectors[0].body.token, "${CCR_ENV_INTERPOLATION_SECRET}");
    assert.equal(sqliteConfig.Providers[0].account.connectors[0].mapping.meters[0].unit, "$CCR_ENV_INTERPOLATION_SECRET");

    const legacyConfig = interpolateRawAppConfigEnvVars(rawConfig, "legacy-json");
    assert.equal(legacyConfig.Providers[0].api_key, "env-secret");
    assert.equal(legacyConfig.Providers[0].account.connectors[0].headers["x-env-secret"], "env-secret");
    assert.equal(legacyConfig.Providers[0].account.connectors[0].body.token, "env-secret");
    assert.equal(legacyConfig.Providers[0].account.connectors[0].mapping.meters[0].unit, "env-secret");
  } finally {
    if (previous === undefined) {
      delete process.env.CCR_ENV_INTERPOLATION_SECRET;
    } else {
      process.env.CCR_ENV_INTERPOLATION_SECRET = previous;
    }
  }
});
