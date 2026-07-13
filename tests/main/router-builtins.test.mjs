import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "../../packages/core/src/gateway/claude-code-router-plugin.ts";
import {
  fallbackRetryDelayAfterNetworkErrorForTest,
  fallbackRetryDelayAfterStatusForTest,
  prepareGatewayUpstreamAttemptForTest
} from "../../packages/core/src/gateway/service.ts";

function createRouterPlugin(options = {}) {
  const agent = options.agent ?? "claude-code";
  const profiles = options.profiles ?? [
    {
      agent,
      enabled: options.profileEnabled ?? true,
      id: `${agent}-profile`,
      model: options.profileModel ?? "",
      name: agent,
      scope: "global"
    }
  ];
  const plugin = new ClaudeCodeRouterPlugin({
    CUSTOM_ROUTER_PATH: "",
    Providers: options.providers ?? [
      {
        modelDescriptions: options.modelDescriptions,
        modelDisplayNames: options.modelDisplayNames,
        models: ["claude-sonnet", "claude-opus", "claude-haiku", "gpt-5-codex"],
        name: "Provider",
        type: "anthropic_messages"
      }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: options.claudeCodeRuleEnabled ?? true },
        codex: { enabled: options.codexRuleEnabled ?? true }
      },
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: options.routerRules ?? []
    },
    profile: {
      enabled: options.profileRuntimeEnabled ?? true,
      profiles
    },
    toolHub: options.toolHub,
    virtualModelProfiles: options.virtualModelProfiles ?? []
  });
  return {
    routeRequest(input) {
      if (options.authenticatedProfileId !== null && input.headers["x-auth-api-key-id"] === undefined) {
        const authenticatedProfileId = options.authenticatedProfileId ?? profiles[0]?.id;
        if (authenticatedProfileId) {
          input.headers["x-auth-api-key-id"] = `profile:${authenticatedProfileId}`;
        }
      }
      return plugin.routeRequest(input);
    }
  };
}

test("fallback retry delay backs off retryable HTTP statuses", () => {
  assert.equal(fallbackRetryDelayAfterStatusForTest({ statusCode: 503 }), 1000);
  assert.equal(fallbackRetryDelayAfterStatusForTest({ failedAttemptIndex: 1, statusCode: 408 }), 2000);
  assert.equal(fallbackRetryDelayAfterStatusForTest({ retryAfter: "3", statusCode: 429 }), 3000);
  assert.equal(fallbackRetryDelayAfterStatusForTest({ retryAfter: "0", statusCode: 429 }), 1000);
});

test("fallback retry delay backs off network errors", () => {
  assert.equal(fallbackRetryDelayAfterNetworkErrorForTest(), 1000);
  assert.equal(fallbackRetryDelayAfterNetworkErrorForTest(2), 4000);
});

function createIssue1480UserConfig() {
  return {
    APIKEY: "gateway-key",
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://nebulacoder.example/v1/chat/completions",
        api_key: "nebulacoder-key",
        modelDescriptions: {
          "nebulacoder-v8.0": "Code reading model.",
          "nebulacoder-cot-v8.0": "Code reading reasoning model."
        },
        models: ["nebulacoder-v8.0", "nebulacoder-cot-v8.0"],
        name: "NebulaCoder"
      },
      {
        api_base_url: "https://coclaw.example/v1/chat/completions",
        api_key: "coclaw-key",
        modelDescriptions: {
          "Qwen3-235B-A22B": "Background task model."
        },
        models: ["Qwen3-235B-A22B"],
        name: "CoClaw"
      },
      {
        api_base_url: "https://opencode.ai/zen/go/v1/chat/completions",
        api_key: "opencode-key",
        capabilities: [
          { baseUrl: "https://opencode.ai/zen/go/v1/chat/completions", type: "openai_chat_completions" }
        ],
        modelDescriptions: {
          "glm-5.1": "Previous generation flagship model.",
          "glm-5.2": "Flagship model.",
          "deepseek-v4-flash": "Default route model.",
          "deepseek-v4-pro": "Thinking route model.",
          "kimi-k2.6": "Claude Code profile model.",
          "kimi-k2.7": "Fast model.",
          "mimo-v2.5": "Lightweight model.",
          "mimo-v2.5-pro": "Enhanced lightweight model."
        },
        models: [
          "glm-5.2",
          "glm-5.1",
          "kimi-k2.7",
          "kimi-k2.6",
          "deepseek-v4-pro",
          "deepseek-v4-flash",
          "mimo-v2.5",
          "mimo-v2.5-pro"
        ],
        name: "OpenCode"
      },
      {
        api_base_url: "https://reasoning.example/v1/chat/completions",
        api_key: "reasoning-key",
        modelDescriptions: {
          "sap-glm-2-2": "Reasoning model."
        },
        models: ["sap-glm-2-2"],
        name: "Reasoning"
      }
    ],
    Router: {
      fallback: { mode: "retry", models: [], retryCount: 1 },
      rules: [
        {
          condition: {
            left: "request.url",
            operator: "contains",
            right: "/v1"
          },
          enabled: true,
          id: "rule-default",
          name: "Default route",
          rewrites: [
            { key: "request.header.x-target-provider", operation: "set", value: "OpenCode" },
            { key: "request.body.model", operation: "set", value: "deepseek-v4-flash" }
          ],
          type: "condition"
        },
        {
          condition: {
            left: "request.header.anthropic-background",
            operator: "==",
            right: "true"
          },
          enabled: true,
          id: "rule-background",
          name: "Background tasks",
          rewrites: [
            { key: "request.header.x-target-provider", operation: "set", value: "CoClaw" },
            { key: "request.body.model", operation: "set", value: "Qwen3-235B-A22B" }
          ],
          type: "condition"
        },
        {
          condition: {
            left: "request.header.anthropic-thinking",
            operator: "==",
            right: "true"
          },
          enabled: true,
          id: "rule-thinking",
          name: "Thinking/reasoning tasks",
          rewrites: [
            { key: "request.header.x-target-provider", operation: "set", value: "OpenCode" },
            { key: "request.body.model", operation: "set", value: "deepseek-v4-pro" }
          ],
          type: "condition"
        }
      ]
    },
    gateway: {
      coreHost: "0.0.0.0",
      corePort: 3457,
      enabled: true,
      host: "0.0.0.0",
      port: 3456
    },
    profile: {
      enabled: true,
      profiles: [
        {
          agent: "claude-code",
          enabled: true,
          id: "claude-code-main",
          model: "kimi-k2.6",
          name: "Claude Code",
          scope: "global"
        }
      ]
    },
    providerPlugins: [
      {
        enabled: true,
        key: "opencode",
        opencode: { enabled: true },
        provider: "openai"
      }
    ],
    virtualModelProfiles: [
      {
        description: "Automatically search the web using Tavily",
        displayName: "Fusion Tavily",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchWebSearch: true,
          maxToolCalls: 10,
          maxTurns: 20,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "fusion-tavily-web-search",
        key: "fusion-tavily",
        match: {
          exactAliases: [],
          prefixes: [],
          suffixes: []
        },
        materialization: {
          enabled: true,
          includeInGatewayModels: true
        },
        metadata: {
          fusionVision: {
            apiKey: "opencode-key",
            baseUrl: "https://opencode.ai/zen/go/v1",
            model: "kimi-k2.6",
            toolName: "vision_understand"
          },
          fusionWebSearch: {
            env: {
              TAVILY_API_KEY: "tavily-key"
            },
            provider: "tavily",
            resultCount: 5,
            toolName: "web_search"
          }
        },
        tools: []
      }
    ]
  };
}

function createIssue1480RouterConfig() {
  const config = createIssue1480UserConfig();
  return {
    ...config,
    Providers: config.Providers.map((provider) => ({
      ...provider,
      credentials: [{ apiKey: provider.api_key, id: `${provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-main` }]
    }))
  };
}

test("built-in Claude Code route matches user-agent case-insensitively", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-sonnet");
  assert.equal(result.decision.model, "Provider/claude-sonnet");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("built-in Codex route uses the authenticated profile instead of the first Codex profile", async () => {
  const plugin = createRouterPlugin({
    agent: "codex",
    authenticatedProfileId: "bs-2",
    profiles: [
      {
        agent: "codex",
        enabled: true,
        id: "codex",
        model: "Codex API/gpt-5.6-sol",
        name: "Codex",
        scope: "ccr"
      },
      {
        agent: "codex",
        enabled: true,
        id: "bs-2",
        model: "uuroute/gpt-5.5",
        name: "bs",
        scope: "ccr"
      }
    ],
    providers: [
      {
        models: ["gpt-5.6-sol"],
        name: "Codex API",
        type: "openai_responses"
      },
      {
        models: ["gpt-5.5"],
        name: "uuroute",
        type: "openai_responses"
      }
    ]
  });
  const result = await plugin.routeRequest({
    body: {
      model: "gpt-5"
    },
    headers: {
      "user-agent": "Codex Desktop/0.144.0"
    },
    method: "POST",
    url: "/v1/responses"
  });

  assert.equal(result.body.model, "uuroute/gpt-5.5");
  assert.equal(result.decision.model, "uuroute/gpt-5.5");
  assert.equal(result.decision.reason, "builtin:codex");
});

test("built-in Codex route preserves the requested model when the authenticated profile does not match", async () => {
  const plugin = createRouterPlugin({
    agent: "codex",
    authenticatedProfileId: "missing-profile",
    profileModel: "Provider/gpt-5-codex"
  });
  const result = await plugin.routeRequest({
    body: {
      model: "Provider/gpt-5-codex"
    },
    headers: {
      "user-agent": "Codex Desktop/0.144.0"
    },
    method: "POST",
    url: "/v1/responses"
  });

  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "default");
});

test("built-in Claude Code route does not inject Claude Code native tool search", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini"
      },
      maxTools: 5,
      requestTimeoutMs: 60000
    }
  });
  const headers = {
    "anthropic-beta": "oauth-2025-04-20",
    "user-agent": "claude-code/1.0"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        { name: "Bash", input_schema: { type: "object" } },
        { name: "Read", input_schema: { type: "object" } },
        { name: "WebFetch", input_schema: { type: "object" } },
        { name: "LookupCustomer", input_schema: { type: "object" } }
      ]
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.tools.some((tool) => String(tool.name || "").startsWith("tool_search_")), false);
  assert.deepEqual(result.body.tools.map((tool) => tool.name), ["Bash", "Read", "WebFetch", "LookupCustomer"]);
  assert.equal(result.body.tools.find((tool) => tool.name === "Bash").defer_loading, undefined);
  assert.equal(result.body.tools.find((tool) => tool.name === "Read").defer_loading, undefined);
  assert.equal(result.body.tools.find((tool) => tool.name === "WebFetch").defer_loading, undefined);
  assert.equal(result.body.tools.find((tool) => tool.name === "LookupCustomer").defer_loading, undefined);
  assert.equal(result.body.system, undefined);
  assert.equal(headers["anthropic-beta"], "oauth-2025-04-20");
});

test("built-in Claude Code route injects ToolHub resolver instructions when ToolHub MCP is available", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini"
      },
      maxTools: 5,
      requestTimeoutMs: 60000
    }
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        { name: "tool_hub.resolve", input_schema: { type: "object" } },
        { name: "mcp__ccr-toolhub__tool_hub_resolve", input_schema: { type: "object" } },
        { name: "mcp__ccr-toolhub__tool_hub_invoke", input_schema: { type: "object" } }
      ]
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.match(result.body.system.at(-1).text, /CCR ToolHub tool resolution is enabled/);
  assert.match(result.body.system.at(-1).text, /ToolHub search\/resolution tool is mcp__ccr-toolhub__tool_hub_resolve/);
  assert.match(result.body.system.at(-1).text, /call this actual tool, do not merely mention its name in text/);
  assert.match(result.body.system.at(-1).text, /MUST call the ToolHub search\/resolution tool mcp__ccr-toolhub__tool_hub_resolve before answering/);
  assert.match(result.body.system.at(-1).text, /external services.*business APIs.*orders.*coupons.*stores.*accounts/);
  assert.match(result.body.system.at(-1).text, /Only skip the ToolHub search\/resolution tool when the request is clearly local/);
  assert.match(result.body.system.at(-1).text, /call the ToolHub invocation tool mcp__ccr-toolhub__tool_hub_invoke/);
  assert.match(result.body.system.at(-1).text, /executionPlanJs.*Promise\.all/);
});

test("built-in Claude Code route does not inject ToolHub instructions without the resolve tool", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini"
      },
      maxTools: 5,
      requestTimeoutMs: 60000
    }
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        { name: "Bash", input_schema: { type: "object" } },
        { name: "Read", input_schema: { type: "object" } }
      ]
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.system, undefined);
});

test("router rules override the built-in Claude Code profile route", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    routerRules: [
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        id: "default",
        name: "Default",
        rewrites: [
          { key: "request.header.x-target-provider", operation: "set", value: "OverrideProvider" },
          { key: "request.body.model", operation: "set", value: "Provider/gpt-5-codex" }
        ],
        type: "condition"
      }
    ]
  });
  const headers = {
    "user-agent": "claude-code/1.0"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(headers["x-target-provider"], "OverrideProvider");
  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "rule:default");
});

test("issue 1520 configured bare profile models do not bypass rule fallback", async () => {
  const plugin = createRouterPlugin({
    profileModel: "deepseek-v4-flash",
    providers: [
      {
        models: ["deepseek-v4-flash"],
        name: "OpenCode",
        type: "openai_chat_completions"
      },
      {
        models: ["Qwen3-235B-A22B"],
        name: "CoClaw",
        type: "openai_chat_completions"
      }
    ],
    routerRules: [
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        fallback: {
          mode: "model-chain",
          models: ["CoClaw/Qwen3-235B-A22B"],
          retryCount: 0
        },
        id: "issue-1520",
        name: "Issue 1520 default route",
        rewrites: [
          { key: "request.header.x-target-provider", operation: "set", value: "OpenCode" },
          { key: "request.body.model", operation: "set", value: "deepseek-v4-flash" }
        ],
        type: "condition"
      }
    ]
  });
  const headers = {
    "user-agent": "claude-code/1.0"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "deepseek-v4-flash"
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.decision.reason, "rule:issue-1520");
  assert.equal(result.decision.source, "rule");
  assert.deepEqual(result.decision.fallback, {
    mode: "model-chain",
    models: ["CoClaw/Qwen3-235B-A22B"],
    retryCount: 0
  });
  assert.equal(headers["x-target-provider"], "OpenCode");
});

test("router rules with unconfigured model rewrites are ignored", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    routerRules: [
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        id: "unknown-target",
        name: "Unknown target",
        rewrites: [
          { key: "request.header.x-target-provider", operation: "set", value: "Provider" },
          { key: "request.body.model", operation: "set", value: "not-configured" }
        ],
        type: "condition"
      },
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        id: "known-target",
        name: "Known target",
        rewrites: [
          { key: "request.body.model", operation: "set", value: "Provider/gpt-5-codex" }
        ],
        type: "condition"
      }
    ]
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "rule:known-target");
});

test("router rules with unconfigured fallback models are ignored", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    routerRules: [
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        fallback: { mode: "model-chain", models: ["Provider/not-configured"], retryCount: 0 },
        id: "unknown-fallback",
        name: "Unknown fallback",
        rewrites: [
          { key: "request.body.model", operation: "set", value: "Provider/gpt-5-codex" }
        ],
        type: "condition"
      },
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        id: "known-fallback",
        name: "Known fallback",
        rewrites: [
          { key: "request.body.model", operation: "set", value: "Provider/gpt-5-codex" }
        ],
        type: "condition"
      }
    ]
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "rule:known-fallback");
});

test("router rules normalize legacy comma provider selectors before gateway provider routing", async () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        capabilities: [
          {
            baseUrl: "https://provider.example/v1",
            type: "openai_chat_completions"
          }
        ],
        credentials: [{ apiKey: "provider-key", id: "provider-main" }],
        models: ["gpt-5-codex"],
        name: "Provider"
      }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: false },
        codex: { enabled: false }
      },
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: [
        {
          condition: {
            left: "request.url",
            operator: "contains",
            right: "/v1"
          },
          enabled: true,
          id: "comma-selector",
          name: "Legacy comma selector",
          rewrites: [
            { key: "request.body.model", operation: "set", value: "Provider,gpt-5-codex" }
          ],
          type: "condition"
        }
      ]
    },
    profile: {
      enabled: false,
      profiles: []
    },
    virtualModelProfiles: []
  };
  const plugin = new ClaudeCodeRouterPlugin(config);
  const headers = {};
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "rule:comma-selector");

  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: result.body,
    config,
    fallback: result.decision.fallback,
    headers,
    method: "POST",
    path: "/v1/messages",
    routedModel: result.decision.model
  });

  assert.equal(upstreamAttempt.logicalProvider, "Provider");
  assert.equal(upstreamAttempt.credentialProtocol, "openai_chat_completions");
  assert.equal(upstreamAttempt.body.model, "gpt-5-codex");
});

test("router rules can add headers after the built-in Claude Code profile route", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    routerRules: [
      {
        condition: {
          left: "request.url",
          operator: "contains",
          right: "/v1"
        },
        enabled: true,
        id: "target-provider",
        name: "Target provider",
        rewrites: [
          { key: "request.header.x-target-provider", operation: "set", value: "Provider" }
        ],
        type: "condition"
      }
    ]
  });
  const headers = {
    "user-agent": "Claude Code"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(headers["x-target-provider"], "Provider");
  assert.equal(result.body.model, "Provider/claude-sonnet");
  assert.equal(result.decision.model, "Provider/claude-sonnet");
  assert.equal(result.decision.reason, "rule:target-provider");
});

test("router rules override explicit provider model requests", async () => {
  const ruleFallback = { mode: "model-chain", models: ["CoClaw/Qwen3-235B-A22B"], retryCount: 0 };
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://opencode.example/v1/chat/completions",
        models: ["deepseek-v4-flash"],
        name: "OpenCode"
      },
      {
        api_base_url: "https://coclaw.example/v1/chat/completions",
        models: ["Qwen3-235B-A22B"],
        name: "CoClaw"
      }
    ],
    Router: {
      fallback: { mode: "retry", models: [], retryCount: 1 },
      rules: [
        {
          condition: {
            left: "request.header.anthropic-background",
            operator: "==",
            right: "true"
          },
          enabled: true,
          fallback: ruleFallback,
          id: "background",
          name: "Background tasks",
          rewrites: [
            { key: "request.header.x-target-provider", operation: "set", value: "CoClaw" },
            { key: "request.body.model", operation: "set", value: "Qwen3-235B-A22B" }
          ],
          type: "condition"
        }
      ]
    },
    profile: {
      enabled: false,
      profiles: []
    },
    virtualModelProfiles: []
  };
  const plugin = new ClaudeCodeRouterPlugin(config);
  const headers = {
    "anthropic-background": "true"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "OpenCode/deepseek-v4-flash"
    },
    headers,
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(headers["x-target-provider"], "CoClaw");
  assert.equal(result.body.model, "Qwen3-235B-A22B");
  assert.equal(result.decision.model, "Qwen3-235B-A22B");
  assert.equal(result.decision.reason, "rule:background");
  assert.deepEqual(result.decision.fallback, ruleFallback);
});

test("issue 1480 raw user config no longer reproduces the Claude Code profile routing failure", async () => {
  const config = createIssue1480UserConfig();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const headers = {
    "user-agent": "claude-cli/2.1.187 (external, cli)"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-sonnet-4-6",
      tools: []
    },
    headers,
    method: "POST",
    url: "/v1/messages?beta=true"
  });

  assert.equal(headers["x-target-provider"], "OpenCode");
  assert.equal(result.body.model, "deepseek-v4-flash");
  assert.equal(result.decision.model, "deepseek-v4-flash");
  assert.equal(result.decision.reason, "rule:rule-default");
});

test("issue 1480 raw user config reproduces the old failure precondition when Router rules are skipped", async () => {
  const config = createIssue1480UserConfig();
  const plugin = new ClaudeCodeRouterPlugin({
    ...config,
    Router: {
      ...config.Router,
      rules: []
    }
  });
  const headers = {
    "x-auth-api-key-id": "profile:claude-code-main",
    "user-agent": "claude-cli/2.1.187 (external, cli)"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-sonnet-4-6",
      tools: []
    },
    headers,
    method: "POST",
    url: "/v1/messages?beta=true"
  });

  assert.equal(headers["x-target-provider"], undefined);
  assert.equal(result.body.model, "kimi-k2.6");
  assert.equal(result.decision.model, "kimi-k2.6");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("issue 1480 raw user config ignores an unreplaced Provider/model subagent placeholder", async () => {
  const config = createIssue1480UserConfig();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const headers = {
    "x-auth-api-key-id": "profile:claude-code-main",
    "user-agent": "claude-cli/2.1.187 (external, cli)"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-sonnet-4-6",
      system: "Use <CCR-SUBAGENT-MODEL>provider/model</CCR-SUBAGENT-MODEL> for this subagent.",
      tools: []
    },
    headers,
    method: "POST",
    url: "/v1/messages?beta=true"
  });

  assert.equal(headers["x-target-provider"], "OpenCode");
  assert.equal(result.body.model, "deepseek-v4-flash");
  assert.equal(result.body.system, "Use  for this subagent.");
  assert.equal(result.decision.model, "deepseek-v4-flash");
  assert.equal(result.decision.reason, "rule:rule-default");
});

test("issue 1480 config routes Claude Code profile traffic through the user default OpenCode rule", async () => {
  const config = createIssue1480RouterConfig();
  const plugin = new ClaudeCodeRouterPlugin(config);
  const headers = {
    "x-auth-api-key-id": "profile:claude-code-main",
    "user-agent": "claude-cli/2.1.187 (external, cli)"
  };
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-sonnet-4-6",
      tools: []
    },
    headers,
    method: "POST",
    url: "/v1/messages?beta=true"
  });

  assert.equal(headers["x-target-provider"], "OpenCode");
  assert.equal(result.body.model, "deepseek-v4-flash");
  assert.equal(result.decision.model, "deepseek-v4-flash");
  assert.equal(result.decision.reason, "rule:rule-default");

  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: result.body,
    config,
    fallback: result.decision.fallback,
    headers,
    method: "POST",
    path: "/v1/messages",
    routedModel: result.decision.model
  });

  assert.equal(upstreamAttempt.logicalProvider, "OpenCode");
  assert.equal(upstreamAttempt.credentialProtocol, "openai_chat_completions");
  assert.equal(upstreamAttempt.body.model, "deepseek-v4-flash");
  assert.match(upstreamAttempt.headers["x-target-providers"], /^provider-opencode-[a-f0-9]{10}::openai_chat_completions::cred:opencode-main$/);
  assert.doesNotMatch(upstreamAttempt.headers["x-target-providers"], /nebulacoder/i);
});

test("OpenAI chat completion streaming attempts request upstream usage chunks", () => {
  const config = createIssue1480RouterConfig();
  const headers = {
    "x-target-provider": "OpenCode"
  };
  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "deepseek-v4-flash",
      stream: true,
      stream_options: {
        extra_flag: "keep"
      }
    },
    config,
    headers,
    method: "POST",
    path: "/v1/messages",
    routedModel: "deepseek-v4-flash"
  });

  assert.equal(upstreamAttempt.credentialProtocol, "openai_chat_completions");
  assert.equal(upstreamAttempt.body.stream_options.include_usage, true);
  assert.equal(upstreamAttempt.body.stream_options.extra_flag, "keep");
});

test("explicit OpenAI chat provider selectors request upstream usage chunks without credential routing", () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://api.kimi.example/v1/chat/completions",
        capabilities: [
          { baseUrl: "https://api.kimi.example/v1/chat/completions", type: "openai_chat_completions" }
        ],
        models: ["kimi-for-coding"],
        name: "Kimi Code - Coding Plan"
      }
    ],
    Router: {
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    virtualModelProfiles: []
  };

  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "Kimi Code - Coding Plan/kimi-for-coding",
      stream: true
    },
    config,
    headers: {},
    method: "POST",
    path: "/v1/messages",
    routedModel: "Kimi Code - Coding Plan/kimi-for-coding"
  });

  assert.equal(upstreamAttempt.credentialProtocol, undefined);
  assert.equal(upstreamAttempt.logicalProvider, undefined);
  assert.equal(upstreamAttempt.body.model, "kimi-for-coding");
  assert.equal(upstreamAttempt.body.stream_options.include_usage, true);
});

test("explicit provider selectors without capability routing strip provider prefix upstream", () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://nebulacoder.example/v1/chat/completions",
        models: ["nebulacoder-v8.0", "nebulacoder-cot-v8.0"],
        name: "NebulaCoder"
      }
    ],
    Router: {
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    virtualModelProfiles: []
  };

  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "NebulaCoder/nebulacoder-cot-v8.0"
    },
    config,
    headers: {},
    method: "POST",
    path: "/v1/chat/completions",
    routedModel: "NebulaCoder/nebulacoder-cot-v8.0"
  });

  assert.equal(upstreamAttempt.body.model, "nebulacoder-cot-v8.0");
});

test("model-chain fallback model selectors must not keep stale target provider headers", () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://opencode.example/v1/chat/completions",
        models: ["deepseek-v4-flash"],
        name: "OpenCode"
      },
      {
        api_base_url: "https://coclaw.example/v1/chat/completions",
        models: ["Qwen3-235B-A22B"],
        name: "CoClaw"
      }
    ],
    Router: {
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    virtualModelProfiles: []
  };
  const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      messages: [],
      model: "Qwen3-235B-A22B"
    },
    config,
    headers: {
      "x-target-provider": "OpenCode"
    },
    method: "POST",
    path: "/v1/chat/completions",
    routedModel: "Qwen3-235B-A22B"
  });

  assert.notEqual(upstreamAttempt.headers["x-target-provider"], "OpenCode");
  assert.equal(upstreamAttempt.body.model, "Qwen3-235B-A22B");
});

test("gateway strips unsupported OpenAI upstream request parameters", () => {
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://openai-compatible.example/v1",
        capabilities: [
          { baseUrl: "https://openai-compatible.example/v1", type: "openai_chat_completions" },
          { baseUrl: "https://openai-compatible.example/v1", type: "openai_responses" }
        ],
        credentials: [{ apiKey: "provider-key", id: "provider-main" }],
        models: ["gpt-compatible"],
        name: "OpenAI Compatible"
      }
    ],
    Router: {
      fallback: { mode: "off", models: [], retryCount: 0 },
      rules: []
    },
    virtualModelProfiles: []
  };
  const cases = [
    {
      body: { messages: [], model: "gpt-compatible", reasoning: { effort: "medium" }, reasoning_split: true, thinking: { type: "enabled" } },
      path: "/v1/chat/completions"
    },
    {
      body: { input: "hello", model: "gpt-compatible", reasoning: { effort: "medium" }, reasoning_split: true, thinking: { type: "enabled" } },
      path: "/v1/responses"
    }
  ];

  for (const item of cases) {
    const upstreamAttempt = prepareGatewayUpstreamAttemptForTest({
      body: item.body,
      config,
      headers: {
        "x-target-provider": "OpenAI Compatible"
      },
      method: "POST",
      path: item.path,
      routedModel: "gpt-compatible"
    });

    assert.equal(upstreamAttempt.body.thinking, undefined);
    assert.equal(upstreamAttempt.body.reasoning_split, undefined);
    assert.deepEqual(upstreamAttempt.body.reasoning, { effort: "medium" });
  }
});

test("built-in Claude Code route overrides explicit virtual gateway models", async () => {
  const plugin = createRouterPlugin({
    profileModel: "Provider/claude-sonnet",
    virtualModelProfiles: [
      {
        displayName: "Kimisearch",
        enabled: true,
        id: "fusion-search",
        key: "kimisearch",
        match: { exactAliases: ["kimisearch"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true }
      }
    ]
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "Fusion/kimisearch"
    },
    headers: {
      "user-agent": "claude-code/1.0"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-sonnet");
  assert.equal(result.decision.model, "Provider/claude-sonnet");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("built-in Codex route stays inactive when profile model is unset", async () => {
  const plugin = createRouterPlugin({
    agent: "codex"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "gpt-5"
    },
    headers: {
      "user-agent": "openai-codex test"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "gpt-5");
  assert.equal(result.decision.reason, "default");
});

test("built-in agent route stays off after the user disables it", async () => {
  const plugin = createRouterPlugin({
    claudeCodeRuleEnabled: false,
    profileModel: "Provider/claude-sonnet"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default"
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "claude-default");
  assert.equal(result.decision.reason, "default");
});

test("built-in Claude Code route injects subagent model instructions into Agent and Task tools", async () => {
  const plugin = createRouterPlugin({
    modelDescriptions: {
      "claude-sonnet": "Balanced coding model for everyday implementation.",
      "gpt-5-codex": "Use for long refactors and repository-scale reasoning."
    },
    modelDisplayNames: {
      "claude-sonnet": "Claude Sonnet"
    },
    profileModel: "Provider/claude-sonnet"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          description: "Start a subagent.",
          input_schema: {
            properties: {
              prompt: { description: "Task prompt.", type: "string" }
            },
            type: "object"
          },
          name: "Agent"
        },
        {
          description: "Start a task.",
          input_schema: {
            properties: {
              prompt: { description: "Task prompt.", type: "string" }
            },
            type: "object"
          },
          name: "Task"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  for (const tool of result.body.tools) {
    assert.match(tool.description, /<CCR-SUBAGENT-MODEL>Provider\/model<\/CCR-SUBAGENT-MODEL>/);
    assert.match(tool.description, /MUST start/);
    assert.match(tool.description, /Provider\/claude-sonnet \(Claude Sonnet\): Balanced coding model/);
    assert.match(tool.description, /Provider\/gpt-5-codex: Use for long refactors/);
    assert.match(tool.input_schema.properties.prompt.description, /MUST start with <CCR-SUBAGENT-MODEL>Provider\/model<\/CCR-SUBAGENT-MODEL>/);
    assert.match(tool.input_schema.properties.prompt.description, /Provider\/claude-sonnet \(Claude Sonnet\): Balanced coding model/);
    assert.match(tool.input_schema.properties.prompt.description, /Provider\/gpt-5-codex: Use for long refactors/);
    assert.doesNotMatch(tool.input_schema.properties.prompt.description, /optionally include/);
  }
});

test("built-in Claude Code route injects subagent model descriptions in stable order", async () => {
  const providersA = [
    {
      modelDescriptions: {
        "z-model": "Zeta model.",
        "a-model": "Alpha model."
      },
      models: ["z-model", "a-model"],
      name: "Zeta",
      type: "anthropic_messages"
    },
    {
      modelDescriptions: {
        "z-model": "Z model.",
        "a-model": "A model."
      },
      models: ["z-model", "a-model"],
      name: "Alpha",
      type: "anthropic_messages"
    }
  ];
  const providersB = [
    {
      modelDescriptions: {
        "a-model": "A model.",
        "z-model": "Z model."
      },
      models: ["a-model", "z-model"],
      name: "Alpha",
      type: "anthropic_messages"
    },
    {
      modelDescriptions: {
        "a-model": "Alpha model.",
        "z-model": "Zeta model."
      },
      models: ["a-model", "z-model"],
      name: "Zeta",
      type: "anthropic_messages"
    }
  ];
  const routeRequest = (plugin) => plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          description: "Start a subagent.",
          input_schema: {
            properties: {
              prompt: { description: "Task prompt.", type: "string" }
            },
            type: "object"
          },
          name: "Agent"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  const pluginA = createRouterPlugin({ profileModel: "Alpha/a-model", providers: providersA });
  const pluginB = createRouterPlugin({ profileModel: "Alpha/a-model", providers: providersB });
  const [resultA, resultB] = await Promise.all([routeRequest(pluginA), routeRequest(pluginB)]);
  const description = resultA.body.tools[0].description;

  assert.equal(description, resultB.body.tools[0].description);
  assert.ok(description.indexOf("- Alpha/a-model: A model.") < description.indexOf("- Alpha/z-model: Z model."));
  assert.ok(description.indexOf("- Alpha/z-model: Z model.") < description.indexOf("- Zeta/a-model: Alpha model."));
  assert.ok(description.indexOf("- Zeta/a-model: Alpha model.") < description.indexOf("- Zeta/z-model: Zeta model."));
});

test("built-in Claude Code route injects workflow subagent model instructions into the Workflow tool", async () => {
  const plugin = createRouterPlugin({
    modelDescriptions: {
      "claude-sonnet": "Balanced coding model for everyday implementation.",
      "gpt-5-codex": "Use for long refactors and repository-scale reasoning."
    },
    profileModel: "Provider/claude-sonnet"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          description: "Run a workflow.",
          input_schema: {
            properties: {
              script: { description: "Workflow script.", type: "string" }
            },
            type: "object"
          },
          name: "Workflow"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  const tool = result.body.tools[0];
  assert.match(tool.description, /CCR workflow subagent routing is enabled/);
  assert.match(tool.description, /Agent\/Task subagents/);
  assert.match(tool.description, /each spawned agent prompt MUST start with <CCR-SUBAGENT-MODEL>Provider\/model<\/CCR-SUBAGENT-MODEL>/);
  assert.match(tool.description, /Provider\/claude-sonnet: Balanced coding model/);
  assert.match(tool.description, /Provider\/gpt-5-codex: Use for long refactors/);
  assert.equal(tool.input_schema.properties.script.description, "Workflow script.");
});

test("built-in Claude Code route injects subagent model instructions into function-style Agent tools", async () => {
  const plugin = createRouterPlugin({
    modelDescriptions: {
      "claude-sonnet": "Balanced coding model for everyday implementation."
    },
    profileModel: "Provider/claude-sonnet"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          function: {
            description: "Start a subagent.",
            name: "Agent",
            parameters: {
              properties: {
                prompt: { description: "Task prompt.", type: "string" }
              },
              type: "object"
            }
          },
          type: "function"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  const tool = result.body.tools[0];
  assert.match(tool.function.description, /<CCR-SUBAGENT-MODEL>Provider\/model<\/CCR-SUBAGENT-MODEL>/);
  assert.match(tool.function.parameters.properties.prompt.description, /MUST start with <CCR-SUBAGENT-MODEL>Provider\/model<\/CCR-SUBAGENT-MODEL>/);
});

test("built-in Claude Code route skips subagent instruction injection when no model has a description", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          description: "Start a subagent.",
          input_schema: {
            properties: {
              prompt: { description: "Task prompt.", type: "string" }
            },
            type: "object"
          },
          name: "Agent"
        },
        {
          description: "Run a workflow.",
          input_schema: {
            properties: {
              script: { description: "Workflow script.", type: "string" }
            },
            type: "object"
          },
          name: "Workflow"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  const agentTool = result.body.tools[0];
  const workflowTool = result.body.tools[1];
  assert.equal(agentTool.description, "Start a subagent.");
  assert.equal(agentTool.input_schema.properties.prompt.description, "Task prompt.");
  assert.equal(workflowTool.description, "Run a workflow.");
  assert.equal(workflowTool.input_schema.properties.script.description, "Workflow script.");
});

test("disabled built-in Claude Code route does not inject Agent tool instructions", async () => {
  const plugin = createRouterPlugin({
    claudeCodeRuleEnabled: false,
    profileModel: "Provider/claude-sonnet"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      tools: [
        {
          description: "Start a subagent.",
          input_schema: {
            properties: {
              prompt: { description: "Task prompt.", type: "string" }
            },
            type: "object"
          },
          name: "Task"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  const tool = result.body.tools[0];
  assert.equal(tool.description, "Start a subagent.");
  assert.equal(tool.input_schema.properties.prompt.description, "Task prompt.");
});

test("built-in Claude Code subagent route uses model tag from system", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      system: "Use <CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL> for this subagent."
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-opus");
  assert.equal(result.body.system, "Use  for this subagent.");
  assert.equal(result.decision.model, "Provider/claude-opus");
  assert.equal(result.decision.reason, "builtin:claude-code-subagent");
});

test("built-in Claude Code subagent route ignores the Provider/model placeholder", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      system: "Use <CCR-SUBAGENT-MODEL>Provider/model</CCR-SUBAGENT-MODEL> for this subagent."
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-sonnet");
  assert.equal(result.body.system, "Use  for this subagent.");
  assert.equal(result.decision.model, "Provider/claude-sonnet");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("built-in Claude Code route removes the first billing system block before subagent tag extraction", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      system: [
        {
          text: "x-anthropic-billing-header: {\"cc_is_subagent\":true}",
          type: "text"
        },
        {
          text: "Use <CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL> for this subagent.",
          type: "text"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-opus");
  assert.deepEqual(result.body.system, [
    {
      text: "Use  for this subagent.",
      type: "text"
    }
  ]);
  assert.equal(result.decision.reason, "builtin:claude-code-subagent");
});

test("built-in Claude Code route keeps a string billing system prompt unchanged", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      system: "x-anthropic-billing-header: {\"cc_is_subagent\":true}"
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.system, "x-anthropic-billing-header: {\"cc_is_subagent\":true}");
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("built-in Claude Code route removes only the first billing system array item", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "claude-default",
      system: [
        {
          text: "x-anthropic-billing-header: {\"cc_is_subagent\":true}",
          type: "text"
        }
      ]
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal("system" in result.body, false);
  assert.equal(result.decision.reason, "builtin:claude-code");
});

test("non-Claude-Code routes keep billing system prompts unchanged", async () => {
  const plugin = createRouterPlugin({
    agent: "codex",
    profileModel: "Provider/gpt-5-codex"
  });
  const result = await plugin.routeRequest({
    body: {
      messages: [],
      model: "gpt-5",
      system: "x-anthropic-billing-header: {\"cc_is_subagent\":true}"
    },
    headers: {
      "user-agent": "openai-codex test"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.system, "x-anthropic-billing-header: {\"cc_is_subagent\":true}");
  assert.equal(result.decision.reason, "builtin:codex");
});

test("built-in Claude Code subagent route scans only the first two messages for tags", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [
        { content: "first", role: "user" },
        {
          content: [
            {
              text: "second <CCR-SUBAGENT-MODEL>Provider/claude-haiku</CCR-SUBAGENT-MODEL>",
              type: "text"
            }
          ],
          role: "user"
        },
        { content: "third <CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL>", role: "user" }
      ],
      model: "claude-default"
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-haiku");
  assert.equal(result.body.messages[1].content[0].text, "second ");
  assert.match(result.body.messages[2].content, /Provider\/claude-opus/);
  assert.equal(result.decision.reason, "builtin:claude-code-subagent");
});

test("built-in Claude Code subagent route ignores tags outside the first two messages", async () => {
  const plugin = createRouterPlugin({ profileModel: "Provider/claude-sonnet" });
  const result = await plugin.routeRequest({
    body: {
      messages: [
        { content: "first", role: "user" },
        { content: "assistant response", role: "assistant" },
        { content: "third <CCR-SUBAGENT-MODEL>Provider/claude-opus</CCR-SUBAGENT-MODEL>", role: "user" }
      ],
      model: "claude-default"
    },
    headers: {
      "user-agent": "Claude Code"
    },
    method: "POST",
    url: "/v1/messages"
  });

  assert.equal(result.body.model, "Provider/claude-sonnet");
  assert.match(result.body.messages[2].content, /Provider\/claude-opus/);
  assert.equal(result.decision.reason, "builtin:claude-code");
});
