import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeOpenRouterDiscountProviderRouterSelection,
  openRouterDiscountProviderRouterTransform
} from "@ccr/core/plugins/built-ins/openrouter-discount-provider-router.ts";

test("OpenRouter discount router does not run unless the model opt-in is enabled", async () => {
  const originalFetch = globalThis.fetch;
  const warnings = [];
  try {
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called for disabled models");
    };

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: { model: "OpenRouter/z-ai/glm-disabled" },
        routedModel: "OpenRouter/z-ai/glm-disabled"
      }),
      transformContext({
        Providers: [openRouterProvider({
          modelMetadata: {
            "z-ai/glm-disabled": {
              openRouterDiscountRouting: { enabled: false }
            }
          },
          models: ["z-ai/glm-disabled"]
        })]
      }, warnings)
    );

    assert.equal(result, undefined);
    assert.deepEqual(warnings, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router switches to the cheapest endpoint and reports savings", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const baseUrl = "https://openrouter-unit-switch.test/api/v1";
  try {
    globalThis.fetch = endpointFetch(calls, [
      endpoint({
        completion: "0.00002",
        name: "Expensive",
        prompt: "0.00001",
        tag: "expensive"
      }),
      endpoint({
        completion: "0.0000048",
        name: "Cheap",
        prompt: "0.0000024",
        tag: "cheap"
      })
    ]);

    const body = {
      max_tokens: 500,
      model: "OpenRouter/z-ai/glm-5.2-switch",
      provider: { order: ["expensive"] }
    };
    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body,
        requestId: "switch-req",
        routedModel: "OpenRouter/z-ai/glm-5.2-switch",
        sessionId: "switch-session",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-5.2-switch",
        providerOverrides: {
          apiKey: ""
        },
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${baseUrl}/models/z-ai/glm-5.2-switch/endpoints`);
    assert.equal(calls[0].authorization, undefined);
    assert.deepEqual(body.provider, { order: ["expensive"] });
    assert.deepEqual(result.body.provider, {
      allow_fallbacks: true,
      order: ["cheap"],
      require_parameters: true
    });
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-switched"], "true");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-reason"], "switched-cheaper-after-cache-loss");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-baseline-provider"], "expensive");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider-name"], "Cheap");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-cheapest-off-pct"], "76.00");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-gross-savings-usd"], "0.0152");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-savings-usd"], "0.0152");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router times out endpoint refreshes after five seconds", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const warnings = [];
  try {
    let timeoutDelay;
    globalThis.setTimeout = (callback, delay, ...args) => {
      timeoutDelay = delay;
      const timer = originalSetTimeout(() => {}, 1);
      queueMicrotask(() => callback(...args));
      return timer;
    };
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          model: "OpenRouter/z-ai/glm-timeout"
        },
        requestId: "timeout-req",
        routedModel: "OpenRouter/z-ai/glm-timeout"
      }),
      transformContext(enabledConfig({
        baseUrl: "https://openrouter-unit-timeout.test/api/v1",
        model: "z-ai/glm-timeout"
      }), warnings)
    );

    assert.equal(result, undefined);
    assert.equal(timeoutDelay, 5_000);
    assert.match(warnings.join("\n"), /timed out after 5000ms/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("OpenRouter discount router cools down failed endpoint refreshes", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const calls = [];
  const warnings = [];
  const baseUrl = "https://openrouter-unit-failure-cooldown.test/api/v1";
  let now = 1_000_000;
  try {
    Date.now = () => now;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return new Response("temporary outage", { status: 503 });
      }
      return endpointResponse([
        endpoint({
          completion: "0.00002",
          name: "Expensive",
          prompt: "0.00001",
          tag: "expensive"
        }),
        endpoint({
          completion: "0.0000048",
          name: "Cheap",
          prompt: "0.0000024",
          tag: "cheap"
        })
      ]);
    };

    const config = enabledConfig({
      baseUrl,
      model: "z-ai/glm-failure-cooldown",
      routing: {
        cacheHitRate: 0,
        minSavingsRatio: 0,
        minSavingsUsd: 0
      }
    });
    const runTransform = (requestId) => openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-failure-cooldown",
          provider: { order: ["expensive"] }
        },
        requestId,
        routedModel: "OpenRouter/z-ai/glm-failure-cooldown",
        tokenCount: 1000
      }),
      transformContext(config, warnings)
    );

    const first = await runTransform("failure-cooldown-1");
    const second = await runTransform("failure-cooldown-2");
    now += 60_001;
    const third = await runTransform("failure-cooldown-3");

    assert.equal(first, undefined);
    assert.equal(second, undefined);
    assert.equal(third.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(calls.length, 2);
    assert.match(warnings.join("\n"), /failed \(503\): temporary outage/);
    assert.match(warnings.join("\n"), /cooling down after failure/);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router includes cache write pricing in endpoint selection", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-cache-write-cost.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        cacheWrite: "0",
        completion: "0",
        name: "Steady",
        prompt: "0.000005",
        tag: "steady"
      }),
      endpoint({
        cacheWrite: "0.0001",
        completion: "0",
        name: "Write Expensive",
        prompt: "0.000001",
        tag: "write-expensive"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 1,
          messages: [{
            content: [{
              cache_control: { type: "ephemeral" },
              text: "x".repeat(4000),
              type: "text"
            }],
            role: "user"
          }],
          model: "OpenRouter/z-ai/glm-cache-write-cost"
        },
        requestId: "cache-write-cost-req",
        routedModel: "OpenRouter/z-ai/glm-cache-write-cost",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-cache-write-cost",
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "steady");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-cache-write-tokens"], "1000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router charges cache writes only for cache_control-marked blocks", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-cache-write-blocks.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        cacheWrite: "0",
        completion: "0",
        name: "Steady",
        prompt: "0.00001",
        tag: "steady"
      }),
      endpoint({
        cacheWrite: "0.0001",
        completion: "0",
        name: "Write Expensive",
        prompt: "0.000001",
        tag: "write-expensive"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 1,
          messages: [{
            content: [
              {
                text: "x".repeat(8000),
                type: "text"
              },
              {
                cache_control: { type: "ephemeral" },
                text: "cached",
                type: "text"
              }
            ],
            role: "user"
          }],
          model: "OpenRouter/z-ai/glm-cache-write-blocks"
        },
        requestId: "cache-write-blocks-req",
        routedModel: "OpenRouter/z-ai/glm-cache-write-blocks",
        tokenCount: 2000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-cache-write-blocks",
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "write-expensive");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-cache-write-tokens"], "2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router estimates prompt tokens from the current transformed body", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-current-body-tokens.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        completion: "0",
        name: "Only",
        prompt: "0.000001",
        tag: "only"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 1,
          messages: [{ content: "x".repeat(1200), role: "user" }],
          model: "OpenRouter/z-ai/glm-current-body-tokens"
        },
        requestId: "current-body-tokens-req",
        routedModel: "OpenRouter/z-ai/glm-current-body-tokens",
        tokenCount: 1
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-current-body-tokens",
        routing: {
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.ok(Number(result.responseHeaders["x-ccr-openrouter-discount-prompt-tokens"]) > 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router keeps the baseline when cache loss outweighs savings", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-cache-loss.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        cacheRead: "0",
        completion: "0.000002",
        name: "Expensive",
        prompt: "0.00001",
        supportsImplicitCaching: true,
        tag: "expensive"
      }),
      endpoint({
        completion: "0.000001",
        name: "Cheap",
        prompt: "0.000008",
        tag: "cheap"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 10,
          model: "OpenRouter/z-ai/glm-cache-loss",
          provider: { order: ["expensive"] }
        },
        requestId: "cache-loss-req",
        routedModel: "OpenRouter/z-ai/glm-cache-loss",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-cache-loss",
        routing: {
          cacheHitRate: 0.75,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.deepEqual(result.body.provider, {
      allow_fallbacks: true,
      order: ["expensive"],
      require_parameters: true
    });
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-switched"], "false");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-reason"], "cache-loss-or-threshold");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-gross-savings-usd"], "0.00201");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-cache-loss-usd"], "0.0075");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-potential-net-savings-usd"], "-0.00549");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-savings-usd"], "0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router excludes blacklisted providers before selecting an endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-blacklist.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        completion: "0.00002",
        name: "Expensive",
        prompt: "0.00001",
        tag: "expensive"
      }),
      endpoint({
        completion: "0.00001",
        name: "Mid",
        prompt: "0.000005",
        tag: "mid"
      }),
      endpoint({
        completion: "0.0000048",
        name: "Cheap",
        prompt: "0.0000024",
        tag: "cheap"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-blacklist",
          provider: {
            ignore: ["Legacy Provider"],
            order: ["expensive"]
          }
        },
        requestId: "blacklist-req",
        routedModel: "OpenRouter/z-ai/glm-blacklist",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-blacklist",
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0,
          providerBlacklist: ["Cheap"]
        }
      }))
    );

    assert.deepEqual(result.body.provider, {
      allow_fallbacks: true,
      ignore: ["legacy-provider", "cheap"],
      order: ["mid"],
      require_parameters: true
    });
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-switched"], "true");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "mid");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider-name"], "Mid");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-ignored-providers"], "legacy-provider,cheap");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-savings-usd"], "0.01");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router caches endpoints for the default ten minute TTL", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const calls = [];
  const baseUrl = "https://openrouter-unit-default-cache.test/api/v1";
  let now = 1_000_000;
  try {
    Date.now = () => now;
    globalThis.fetch = endpointFetch(calls, [
      endpoint({
        completion: "0.00002",
        name: "Expensive",
        prompt: "0.00001",
        tag: "expensive"
      }),
      endpoint({
        completion: "0.0000048",
        name: "Cheap",
        prompt: "0.0000024",
        tag: "cheap"
      })
    ]);

    const config = enabledConfig({
      baseUrl,
      model: "z-ai/glm-default-cache",
      routing: {
        cacheHitRate: 0,
        minSavingsRatio: 0,
        minSavingsUsd: 0
      }
    });
    const runTransform = (requestId) => openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-default-cache",
          provider: { order: ["expensive"] }
        },
        requestId,
        routedModel: "OpenRouter/z-ai/glm-default-cache",
        tokenCount: 1000
      }),
      transformContext(config)
    );

    const first = await runTransform("default-cache-1");
    now += 9 * 60_000 + 59_000;
    const second = await runTransform("default-cache-2");
    now += 2_000;
    const third = await runTransform("default-cache-3");

    assert.equal(first.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(second.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(third.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(calls.length, 2);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router commits session baselines only after confirmed success", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-session-confirm.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        completion: "0.00002",
        name: "Expensive",
        prompt: "0.00001",
        tag: "expensive"
      }),
      endpoint({
        completion: "0.0000048",
        name: "Cheap",
        prompt: "0.0000024",
        tag: "cheap"
      })
    ]);
    const config = enabledConfig({
      baseUrl,
      model: "z-ai/glm-session-confirm",
      routing: {
        allowFallbacks: false,
        cacheHitRate: 0,
        minSavingsRatio: 0,
        minSavingsUsd: 0
      }
    });

    const first = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-session-confirm",
          provider: { order: ["expensive"] }
        },
        requestId: "session-confirm-1",
        routedModel: "OpenRouter/z-ai/glm-session-confirm",
        sessionId: "session-confirm",
        tokenCount: 1000
      }),
      transformContext(config)
    );
    assert.equal(first.responseHeaders["x-ccr-openrouter-discount-reason"], "switched-cheaper-after-cache-loss");

    const beforeConfirm = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-session-confirm"
        },
        requestId: "session-confirm-2",
        routedModel: "OpenRouter/z-ai/glm-session-confirm",
        sessionId: "session-confirm",
        tokenCount: 1000
      }),
      transformContext(config)
    );
    assert.equal(beforeConfirm.responseHeaders["x-ccr-openrouter-discount-reason"], "initial-cheapest");

    finalizeOpenRouterDiscountProviderRouterSelection("session-confirm-1", {
      ok: true,
      routedModel: "OpenRouter/z-ai/glm-session-confirm",
      usedCcrFallback: false
    });

    const afterConfirm = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-session-confirm"
        },
        requestId: "session-confirm-3",
        routedModel: "OpenRouter/z-ai/glm-session-confirm",
        sessionId: "session-confirm",
        tokenCount: 1000
      }),
      transformContext(config)
    );
    assert.equal(afterConfirm.responseHeaders["x-ccr-openrouter-discount-reason"], "already-cheapest");

    finalizeOpenRouterDiscountProviderRouterSelection("session-confirm-2", { ok: false });
    finalizeOpenRouterDiscountProviderRouterSelection("session-confirm-3", { ok: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router respects existing OpenRouter provider constraints", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-provider-constraints.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        completion: "0.000012",
        dataCollection: "deny",
        distillable: true,
        name: "Expensive",
        prompt: "0.000006",
        quantization: "fp8",
        supportedParameters: ["max_tokens"],
        supportsZdr: true,
        tag: "expensive"
      }),
      endpoint({
        completion: "0.00001",
        dataCollection: "deny",
        distillable: true,
        name: "Mid",
        prompt: "0.000005",
        quantization: "mxfp8",
        supportedParameters: ["max_tokens"],
        supportsZdr: true,
        tag: "mid"
      }),
      endpoint({
        completion: "0.000004",
        dataCollection: "allow",
        distillable: false,
        name: "Cheap",
        prompt: "0.000002",
        quantization: "int4",
        supportedParameters: ["max_tokens"],
        supportsZdr: false,
        tag: "cheap"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-provider-constraints",
          provider: {
            data_collection: "deny",
            enforce_distillable_text: true,
            max_price: {
              completion: 12,
              prompt: 6
            },
            only: ["expensive", "mid"],
            order: ["expensive"],
            quantizations: ["fp8"],
            zdr: true
          }
        },
        requestId: "provider-constraints-req",
        routedModel: "OpenRouter/z-ai/glm-provider-constraints",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-provider-constraints",
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.deepEqual(result.body.provider, {
      allow_fallbacks: true,
      data_collection: "deny",
      enforce_distillable_text: true,
      max_price: {
        completion: 12,
        prompt: 6
      },
      only: ["expensive", "mid"],
      order: ["mid"],
      quantizations: ["fp8"],
      require_parameters: true,
      zdr: true
    });
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-switched"], "true");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "mid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router deduplicates concurrent endpoint refreshes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const baseUrl = "https://openrouter-unit-dedupe.test/api/v1";
  let releaseFetch;
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({
        authorization: init?.headers?.authorization,
        url: String(url)
      });
      await new Promise((resolve) => {
        releaseFetch = resolve;
      });
      return endpointResponse([
        endpoint({
          completion: "0.00002",
          name: "Expensive",
          prompt: "0.00001",
          tag: "expensive"
        }),
        endpoint({
          completion: "0.0000048",
          name: "Cheap",
          prompt: "0.0000024",
          tag: "cheap"
        })
      ]);
    };

    const config = enabledConfig({
      baseUrl,
      model: "z-ai/glm-dedupe",
      routing: {
        cacheHitRate: 0,
        endpointTtlMs: 5_000,
        minSavingsRatio: 0,
        minSavingsUsd: 0
      }
    });
    const runTransform = (requestId) => openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-dedupe",
          provider: { order: ["expensive"] }
        },
        requestId,
        routedModel: "OpenRouter/z-ai/glm-dedupe",
        tokenCount: 1000
      }),
      transformContext(config)
    );

    const firstPromise = runTransform("dedupe-1");
    const secondPromise = runTransform("dedupe-2");
    await Promise.resolve();

    assert.equal(calls.length, 1);
    releaseFetch();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    assert.equal(first.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(second.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router does not cache empty endpoint responses", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-empty-cache.test/api/v1";
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return endpointResponse(calls === 1
        ? []
        : [
            endpoint({
              completion: "0.00002",
              name: "Expensive",
              prompt: "0.00001",
              tag: "expensive"
            }),
            endpoint({
              completion: "0.0000048",
              name: "Cheap",
              prompt: "0.0000024",
              tag: "cheap"
            })
          ]);
    };

    const config = enabledConfig({
      baseUrl,
      model: "z-ai/glm-empty-cache",
      routing: {
        cacheHitRate: 0,
        endpointTtlMs: 60_000,
        minSavingsRatio: 0,
        minSavingsUsd: 0
      }
    });
    const runTransform = (requestId) => openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-empty-cache",
          provider: { order: ["expensive"] }
        },
        requestId,
        routedModel: "OpenRouter/z-ai/glm-empty-cache",
        tokenCount: 1000
      }),
      transformContext(config)
    );

    const first = await runTransform("empty-cache-1");
    const second = await runTransform("empty-cache-2");

    assert.equal(first, undefined);
    assert.equal(second.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router bounds the endpoint cache", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const baseUrl = "https://openrouter-unit-cache-bound.test/api/v1";
  const models = Array.from({ length: 551 }, (_, index) => `z-ai/glm-cache-bound-${index}`);
  let calls = 0;
  let now = 10_000_000;
  try {
    Date.now = () => now++;
    globalThis.fetch = async () => {
      calls += 1;
      return endpointResponse([
        endpoint({
          completion: "0.00002",
          name: "Expensive",
          prompt: "0.00001",
          tag: "expensive"
        }),
        endpoint({
          completion: "0.0000048",
          name: "Cheap",
          prompt: "0.0000024",
          tag: "cheap"
        })
      ]);
    };

    const routing = {
      cacheHitRate: 0,
      endpointTtlMs: 60_000,
      minSavingsRatio: 0,
      minSavingsUsd: 0
    };
    const config = {
      Providers: [openRouterProvider({
        baseUrl,
        modelMetadata: Object.fromEntries(models.map((model) => [
          model,
          { openRouterDiscountRouting: { enabled: true, ...routing } }
        ])),
        models
      })]
    };
    const runTransform = (model, requestId) => openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: `OpenRouter/${model}`,
          provider: { order: ["expensive"] }
        },
        requestId,
        routedModel: `OpenRouter/${model}`,
        tokenCount: 1000
      }),
      transformContext(config)
    );

    for (const [index, model] of models.entries()) {
      await runTransform(model, `cache-bound-${index}`);
    }
    assert.equal(calls, models.length);

    const firstModelAgain = await runTransform(models[0], "cache-bound-first-again");

    assert.equal(firstModelAgain.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(calls, models.length + 1);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter discount router reports off percentages relative to the current baseline", async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://openrouter-unit-baseline-off.test/api/v1";
  try {
    globalThis.fetch = endpointFetch([], [
      endpoint({
        completion: "0.0001",
        name: "Very Expensive",
        prompt: "0.00005",
        tag: "very-expensive"
      }),
      endpoint({
        completion: "0.00001",
        name: "Baseline",
        prompt: "0.000005",
        tag: "baseline"
      }),
      endpoint({
        completion: "0.000008",
        name: "Cheap",
        prompt: "0.000004",
        tag: "cheap"
      })
    ]);

    const result = await openRouterDiscountProviderRouterTransform(
      requestInput({
        body: {
          max_tokens: 500,
          model: "OpenRouter/z-ai/glm-baseline-off",
          provider: { order: ["baseline"] }
        },
        requestId: "baseline-off-req",
        routedModel: "OpenRouter/z-ai/glm-baseline-off",
        tokenCount: 1000
      }),
      transformContext(enabledConfig({
        baseUrl,
        model: "z-ai/glm-baseline-off",
        routing: {
          cacheHitRate: 0,
          minSavingsRatio: 0,
          minSavingsUsd: 0
        }
      }))
    );

    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-baseline-provider"], "baseline");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-provider"], "cheap");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-cheapest-off-pct"], "20.00");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-selected-off-pct"], "20.00");
    assert.equal(result.responseHeaders["x-ccr-openrouter-discount-savings-usd"], "0.002");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function enabledConfig({ baseUrl, model, providerOverrides = {}, routing = {} }) {
  return {
    Providers: [openRouterProvider({
      baseUrl,
      modelMetadata: {
        [model]: {
          openRouterDiscountRouting: {
            enabled: true,
            ...routing
          }
        }
      },
      models: [model],
      ...providerOverrides
    })]
  };
}

function openRouterProvider(overrides = {}) {
  return {
    apiKey: "sk-or-test",
    baseUrl: "https://openrouter-unit.test/api/v1",
    modelMetadata: {},
    models: [],
    name: "OpenRouter",
    type: "openai_chat_completions",
    ...overrides
  };
}

function requestInput(overrides = {}) {
  return {
    body: {},
    headers: { "content-type": "application/json" },
    method: "POST",
    path: "/v1/chat/completions",
    requestId: "unit-req",
    url: "/v1/chat/completions",
    ...overrides
  };
}

function transformContext(config, warnings = []) {
  return {
    config,
    logger: {
      warn(message) {
        warnings.push(String(message));
      }
    },
    openSqliteStore() {
      throw new Error("openSqliteStore should not be used by the OpenRouter discount router");
    },
    paths: {
      configDir: "/tmp",
      dataDir: "/tmp",
      pluginDataDir: "/tmp"
    },
    permissions: [],
    pluginConfig: {},
    pluginId: "openrouter"
  };
}

function endpointFetch(calls, endpoints) {
  return async (url, init) => {
    calls.push({
      authorization: init?.headers?.authorization,
      url: String(url)
    });
    return endpointResponse(endpoints);
  };
}

function endpointResponse(endpoints) {
  return new Response(JSON.stringify({ data: { endpoints } }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function endpoint({
  cacheRead,
  cacheWrite,
  completion,
  dataCollection,
  distillable,
  maxCompletionTokens,
  maxPromptTokens,
  name,
  prompt,
  quantization,
  status = 0,
  supportedParameters,
  supportsImplicitCaching = true,
  supportsZdr,
  tag,
  uptime = 100
}) {
  return {
    data_collection: dataCollection,
    distillable,
    max_completion_tokens: maxCompletionTokens,
    max_prompt_tokens: maxPromptTokens,
    pricing: {
      ...(cacheRead === undefined ? {} : { cache_read: cacheRead }),
      ...(cacheWrite === undefined ? {} : { input_cache_write: cacheWrite }),
      completion,
      prompt
    },
    provider_name: name,
    provider_slug: tag,
    quantization,
    status,
    supported_parameters: supportedParameters,
    supports_implicit_caching: supportsImplicitCaching,
    supports_zdr: supportsZdr,
    tag,
    uptime_last_5m: uptime
  };
}
