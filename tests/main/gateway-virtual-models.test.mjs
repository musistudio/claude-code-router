import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import {
  fusionFallbackToolDefinitions,
  fusionWebSearchToolNameForRequest,
  fusionToolNamesBackedByMcpServers,
  fusionBuiltinToolArtifactsForTest,
  extractHostedWebSearchQueryHint,
  hostedWebSearchProtocolResponseStream,
  prepareGatewayUpstreamAttemptForTest,
  selectHostedWebSearchProtocolRecords,
  prepareAnthropicWebSearchProtocolRequestBody,
  prepareClaudeCodeWebSearchContinuationRequestBody,
  prepareHostedWebSearchProtocolRequestBody,
  transformAnthropicWebSearchProtocolResponseValue,
  transformAnthropicWebSearchProtocolSseText,
  transformGeminiHostedWebSearchResponseValue,
  transformGeminiHostedWebSearchSseText,
  transformOpenAiChatHostedWebSearchResponseValue,
  transformOpenAiChatHostedWebSearchSseText,
  transformOpenAiResponsesHostedWebSearchResponseValue,
  transformOpenAiResponsesHostedWebSearchSseText,
  normalizeCoreGatewayVirtualModelProfiles
} from "../../packages/core/src/gateway/service.ts";

test("gateway config rewrites Fusion fixed base and vision models to core provider selectors", () => {
  const providerName = "Zhipu AI (China) - Coding Plan";
  const config = {
    Providers: [
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        capabilities: [
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "openai_chat_completions" },
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "anthropic_messages" }
        ],
        credentials: [{ apiKey: "test-key", id: "test-1" }],
        models: ["glm-5.2", "glm-5v-turbo"],
        name: providerName,
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };
  const profiles = [
    {
      baseModel: { fixedModel: `${providerName}/glm-5.2`, mode: "fixed" },
      displayName: "GLM Fusion",
      enabled: true,
      execution: {
        clientToolsPolicy: "allow",
        maxToolCalls: 8,
        maxTurns: 6,
        mode: "tool_loop",
        streamMode: "optimistic"
      },
      id: "glm-fusion",
      key: "glm-fusion",
      match: { exactAliases: ["glm-fusion"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      metadata: {
        fusionVision: {
          modelSelector: `${providerName}/glm-5v-turbo`,
          toolName: "vision_understand_glm_fusion"
        }
      },
      tools: [{ name: "vision_understand_glm_fusion", visibility: "internal" }]
    }
  ];

  const [profile] = normalizeCoreGatewayVirtualModelProfiles(profiles, config);

  assert.match(
    profile.baseModel.fixedModel,
    /^provider-zhipu-ai-china---coding-plan-[a-f0-9]{10}::anthropic_messages::cred:test-1\/glm-5\.2$/
  );
  assert.match(
    profile.metadata.fusionVision.modelSelector,
    /^provider-zhipu-ai-china---coding-plan-[a-f0-9]{10}::openai_chat_completions::cred:test-1\/glm-5v-turbo$/
  );
  assert.equal(profiles[0].baseModel.fixedModel, `${providerName}/glm-5.2`);
});

test("issue 1480 Fusion vision config injects core auth token into MCP gateway runtime", async () => {
  const providerName = "Zhipu AI (China) - Coding Plan";
  const config = {
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        api_base_url: "https://nebulacoder.example/v1/chat/completions",
        credentials: [{ apiKey: "nebulacoder-key", id: "nebulacoder-main" }],
        models: ["nebulacoder-v8.0", "nebulacoder-cot-v8.0"],
        name: "NebulaCoder"
      },
      {
        api_base_url: "https://coclaw.example/v1/chat/completions",
        credentials: [{ apiKey: "coclaw-key", id: "coclaw-main" }],
        models: ["Qwen3-235B-A22B"],
        name: "CoClaw"
      },
      {
        api_base_url: "https://opencode.ai/zen/go/v1/chat/completions",
        capabilities: [
          { baseUrl: "https://opencode.ai/zen/go/v1/chat/completions", type: "openai_chat_completions" }
        ],
        credentials: [{ apiKey: "opencode-key", id: "opencode-main" }],
        models: ["kimi-k2.6", "deepseek-v4-pro", "deepseek-v4-flash"],
        name: "OpenCode"
      },
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        capabilities: [
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "openai_chat_completions" },
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "anthropic_messages" }
        ],
        credentials: [{ apiKey: "zhipu-key", id: "test-1" }],
        models: ["glm-5.2", "glm-4.5-air", "glm-5v-turbo"],
        name: providerName,
        type: "openai_chat_completions"
      }
    ],
    Router: {
      fallback: { mode: "retry", models: [], retryCount: 1 },
      rules: [
        {
          condition: { left: "request.url", operator: "contains", right: "/v1" },
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
          condition: { left: "request.header.anthropic-background", operator: "==", right: "true" },
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
          condition: { left: "request.header.anthropic-thinking", operator: "==", right: "true" },
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
    gateway: { coreHost: "127.0.0.1", corePort: 3457 },
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
    virtualModelProfiles: [
      {
        baseModel: { fixedModel: `${providerName}/glm-5.2`, mode: "fixed" },
        displayName: "GLM 5 2V",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchMultimodal: true,
          maxToolCalls: 8,
          maxTurns: 6,
          mode: "tool_loop",
          streamMode: "buffered"
        },
        id: "glm-5.2v",
        key: "glm-5.2v",
        match: { exactAliases: ["GLM-5.2V", "Fusion/GLM-5.2V"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionVision: {
            modelSelector: `${providerName}/glm-5v-turbo`,
            toolName: "vision_understand_glm_5_2v"
          }
        },
        tools: [{ name: "vision_understand_glm_5_2v", visibility: "internal" }]
      }
    ]
  };

  const profiles = normalizeCoreGatewayVirtualModelProfiles(config.virtualModelProfiles, config);
  const artifacts = await fusionBuiltinToolArtifactsForTest(profiles, "http://127.0.0.1:3457", "core-token");
  const server = artifacts.mcpServers.find((item) => item.name === "fusion-vision-glm-5.2v");

  assert.ok(server);
  assert.equal(server.env.VISION_GATEWAY_BASE_URL, "http://127.0.0.1:3457/v1");
  assert.equal(server.env.VISION_GATEWAY_API_KEY, "core-token");
  assert.equal(server.env.VISION_API_KEY, undefined);
  assert.match(
    server.env.VISION_MODEL,
    /^provider-zhipu-ai-china---coding-plan-[a-f0-9]{10}::openai_chat_completions::cred:test-1\/glm-5v-turbo$/
  );
});

test("gateway config does not inject core auth token into external Fusion vision MCP runtime", async () => {
  const profiles = [
    {
      enabled: true,
      id: "external-vision",
      key: "external-vision",
      metadata: {
        fusionVision: {
          apiKey: "external-key",
          baseUrl: "https://vision.example/v1",
          model: "gpt-vision",
          toolName: "vision_understand_external"
        }
      }
    }
  ];

  const artifacts = await fusionBuiltinToolArtifactsForTest(profiles, "http://127.0.0.1:3457", "core-token");
  const server = artifacts.mcpServers.find((item) => item.name === "fusion-vision-external-vision");

  assert.ok(server);
  assert.equal(server.env.VISION_BASE_URL, "https://vision.example/v1");
  assert.equal(server.env.VISION_API_KEY, "external-key");
  assert.equal(server.env.VISION_GATEWAY_API_KEY, undefined);
});

test("gateway config passes proxy preload to Fusion built-in MCP runtimes", async () => {
  const profiles = [
    {
      enabled: true,
      id: "fusion-tavily",
      key: "fusion-tavily",
      metadata: {
        fusionWebSearch: {
          env: { TAVILY_API_KEY: "tavily-key" },
          provider: "tavily",
          toolName: "tavily_web_search"
        }
      }
    }
  ];
  const proxyPreloadFile = "/tmp/gateway-proxy-preload.cjs";
  const proxyEnv = {
    CCR_UNDICI_MODULE: "/tmp/undici.js",
    CCR_UPSTREAM_PROXY_URL: "http://127.0.0.1:8888"
  };

  const artifacts = await fusionBuiltinToolArtifactsForTest(
    profiles,
    "http://127.0.0.1:3457",
    "core-token",
    undefined,
    proxyPreloadFile,
    proxyEnv
  );
  const server = artifacts.mcpServers.find((item) => item.name === "fusion-web-search-fusion-tavily");

  assert.ok(server);
  assert.deepEqual(server.args.slice(0, 2), ["--require", proxyPreloadFile]);
  assert.equal(server.args[2].endsWith("fusion-vision-mcp.js"), true);
  assert.equal(server.env.CCR_UPSTREAM_PROXY_URL, proxyEnv.CCR_UPSTREAM_PROXY_URL);
  assert.equal(server.env.CCR_UNDICI_MODULE, proxyEnv.CCR_UNDICI_MODULE);
  assert.equal(server.env.TAVILY_API_KEY, "tavily-key");
});

test("gateway ignores non-Gemini capabilities on Gemini preset providers", () => {
  const providerName = "Google Gemini";
  const config = {
    Providers: [
      {
        api_base_url: "https://generativelanguage.googleapis.com",
        capabilities: [
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "gemini_generate_content" },
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "openai_chat_completions" },
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "openai_responses" },
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "anthropic_messages" }
        ],
        credentials: [{ apiKey: "test-key", id: "test-1" }],
        id: "provider-google-gemini-1785c39128",
        models: ["gemini-2.5-pro"],
        name: providerName,
        type: "gemini_generate_content"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };
  const profiles = [
    {
      baseModel: { fixedModel: `${providerName}/gemini-2.5-pro`, mode: "fixed" },
      displayName: "Gemini Fusion",
      enabled: true,
      execution: {
        clientToolsPolicy: "allow",
        maxToolCalls: 8,
        maxTurns: 6,
        mode: "tool_loop",
        streamMode: "optimistic"
      },
      id: "gemini-fusion",
      key: "gemini-fusion",
      match: { exactAliases: ["gemini-fusion"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      tools: []
    }
  ];

  const [profile] = normalizeCoreGatewayVirtualModelProfiles(profiles, config);

  assert.equal(
    profile.baseModel.fixedModel,
    "provider-google-gemini-1785c39128::gemini_generate_content::cred:test-1/gemini-2.5-pro"
  );
});

test("gateway keeps Gemini Interactions capability on Gemini preset providers", () => {
  const providerName = "Google Gemini";
  const config = {
    Providers: [
      {
        api_base_url: "https://generativelanguage.googleapis.com",
        capabilities: [
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "gemini_generate_content" },
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "gemini_interactions" },
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "openai_responses" }
        ],
        models: ["gemini-3.5-flash"],
        name: providerName,
        type: "gemini_generate_content"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      input: "Say hello",
      model: `${providerName}/gemini-3.5-flash`
    },
    config,
    headers: {
      "x-target-provider": providerName
    },
    method: "POST",
    path: "/v1/responses"
  });

  assert.equal(attempt.headers["x-target-provider"], undefined);
  assert.match(attempt.body.model, /^provider-google-gemini-[a-f0-9]{10}::gemini_interactions\/gemini-3\.5-flash$/);
});

test("gateway lets explicit Gemini Interactions model selectors override generic target provider lists", () => {
  const geminiName = "Google Gemini";
  const config = {
    Providers: [
      {
        api_base_url: "https://generativelanguage.googleapis.com",
        capabilities: [
          { baseUrl: "https://generativelanguage.googleapis.com", source: "preset", type: "gemini_interactions" }
        ],
        models: ["gemma-4-31b-it"],
        name: geminiName,
        type: "gemini_interactions"
      },
      {
        api_base_url: "https://open.bigmodel.cn/api/coding/paas/v4",
        capabilities: [
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "openai_chat_completions" },
          { baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4", type: "anthropic_messages" }
        ],
        credentials: [{ apiKey: "test-key", id: "test-1" }],
        models: ["glm-5.2", "glm-4.5-air", "glm-5v-turbo"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  };

  const attempt = prepareGatewayUpstreamAttemptForTest({
    body: {
      input: "Say hello",
      model: `${geminiName}/gemma-4-31b-it`
    },
    config,
    headers: {
      "x-target-providers": "openai,anthropic"
    },
    method: "POST",
    path: "/v1/responses"
  });

  assert.equal(attempt.headers["x-target-providers"], undefined);
  assert.match(attempt.body.model, /^provider-google-gemini-[a-f0-9]{10}::gemini_interactions\/gemma-4-31b-it$/);
});

test("gateway config normalizes Fusion web search tool names for native Anthropic search triggers", () => {
  const profiles = [
    {
      displayName: "Kimi Search",
      enabled: true,
      execution: {
        clientToolsPolicy: "allow",
        matchWebSearch: true,
        maxToolCalls: 8,
        maxTurns: 6,
        mode: "tool_loop",
        streamMode: "optimistic"
      },
      id: "kimisearch",
      key: "kimisearch",
      match: { exactAliases: ["kimisearch"], prefixes: [], suffixes: [] },
      materialization: { enabled: true, includeInGatewayModels: true },
      metadata: {
        fusionWebSearch: { provider: "browser", toolName: "web_search_kimisearch" }
      },
      tools: [{ name: "web_search_kimisearch", visibility: "internal" }]
    }
  ];

  const [profile] = normalizeCoreGatewayVirtualModelProfiles(profiles, {
    Providers: [],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {}
  });

  assert.equal(profile.metadata.fusionWebSearch.toolName, "kimisearch_web_search");
  assert.deepEqual(profile.tools.map((tool) => tool.name), ["kimisearch_web_search"]);
  assert.match(profile.instructions.append, /call the kimisearch_web_search function tool before answering/);
});

test("gateway resolves normalized Fusion web search tool names for Anthropic protocol bridging", () => {
  const config = {
    Providers: [],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {},
    virtualModelProfiles: [
      {
        displayName: "Kimisearch",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchWebSearch: true,
          maxToolCalls: 8,
          maxTurns: 6,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "fusion-2",
        key: "kimisearch",
        match: { exactAliases: ["kimisearch", "Fusion/kimisearch"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionWebSearch: { provider: "browser", toolName: "web_search_fusion_2" }
        },
        tools: [{ name: "web_search_fusion_2", visibility: "internal" }]
      }
    ]
  };

  assert.equal(fusionWebSearchToolNameForRequest(config, "Fusion/kimisearch"), "fusion_2_web_search");
});

test("gateway does not route hosted web search through an unrelated Fusion search profile", () => {
  const config = {
    Providers: [
      {
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        credentials: [{ apiKey: "test-key", id: "test-1" }],
        models: ["glm-5.2", "glm-5v-turbo"],
        name: "Zhipu AI (China) - Coding Plan",
        type: "openai_chat_completions"
      },
      {
        baseUrl: "https://api.moonshot.cn/anthropic",
        models: ["kimi-for-coding"],
        name: "Kimi Code - Coding Plan",
        type: "openai_chat_completions"
      }
    ],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {},
    virtualModelProfiles: [
      {
        baseModel: { fixedModel: "Zhipu AI (China) - Coding Plan/glm-5.2", mode: "fixed" },
        displayName: "GLM 5 2V",
        enabled: true,
        execution: {
          clientToolsPolicy: "deny",
          matchMultimodal: true,
          matchWebSearch: false,
          maxToolCalls: 8,
          maxTurns: 6,
          mode: "tool_loop",
          streamMode: "buffered"
        },
        id: "glm-5.2v",
        key: "glm-5.2v",
        match: { exactAliases: ["GLM-5.2V"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionVision: { modelSelector: "Zhipu AI (China) - Coding Plan/glm-5v-turbo", toolName: "vision_understand_glm_5_2v" }
        },
        tools: [{ name: "vision_understand_glm_5_2v", visibility: "internal" }]
      },
      {
        baseModel: { fixedModel: "Kimi Code - Coding Plan/kimi-for-coding", mode: "fixed" },
        displayName: "Kimisearch",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchWebSearch: true,
          maxToolCalls: 8,
          maxTurns: 6,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "fusion-2",
        key: "kimisearch",
        match: { exactAliases: ["kimisearch"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionWebSearch: { provider: "browser", toolName: "web_search_fusion_2" }
        },
        tools: [{ name: "web_search_fusion_2", visibility: "internal" }]
      }
    ]
  };

  assert.equal(fusionWebSearchToolNameForRequest(config, "Fusion/GLM-5.2V"), undefined);
  assert.equal(fusionWebSearchToolNameForRequest(config, "Fusion/kimisearch"), "fusion_2_web_search");
});

test("gateway resolves non-browser Fusion web search tools for hosted protocol bridging", () => {
  const config = {
    Providers: [],
    Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
    gateway: {},
    virtualModelProfiles: [
      {
        displayName: "Research",
        enabled: true,
        execution: {
          clientToolsPolicy: "allow",
          matchWebSearch: true,
          maxToolCalls: 8,
          maxTurns: 6,
          mode: "tool_loop",
          streamMode: "optimistic"
        },
        id: "research",
        key: "research",
        match: { exactAliases: ["research", "Fusion/research"], prefixes: [], suffixes: [] },
        materialization: { enabled: true, includeInGatewayModels: true },
        metadata: {
          fusionWebSearch: { provider: "brave", toolName: "research_web_search" }
        },
        tools: [{ name: "research_web_search", visibility: "internal" }]
      }
    ]
  };

  assert.equal(fusionWebSearchToolNameForRequest(config, "Fusion/research"), "research_web_search");
  assert.equal(fusionWebSearchToolNameForRequest(config, "gpt-5"), undefined);
});

test("gateway prefetches non-browser Fusion web search records without browser integration", async () => {
  const requests = [];
  const endpoint = "http://127.0.0.1/tavily-search";
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), endpoint);
    requests.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({
      results: [
        { content: "The result body", title: "Result title", url: "https://example.test/result" }
      ]
    }), { headers: { "content-type": "application/json" }, status: 200 });
  };
  try {
    const config = {
      Providers: [],
      Router: { fallback: { mode: "off", models: [], retryCount: 0 } },
      gateway: {},
      virtualModelProfiles: [
        {
          displayName: "Research",
          enabled: true,
          id: "research",
          key: "research",
          match: { exactAliases: ["Fusion/research"], prefixes: [], suffixes: [] },
          metadata: {
            fusionWebSearch: {
              env: { TAVILY_API_KEY: "tavily-key", TAVILY_SEARCH_ENDPOINT: endpoint },
              provider: "tavily",
              resultCount: 3,
              toolName: "research_web_search"
            }
          }
        }
      ]
    };

    const records = await selectHostedWebSearchProtocolRecords({
      protocol: "anthropic_messages",
      queryHint: "search query",
      requestId: "req-1",
      sinceMs: Date.now() - 1000,
      toolName: "research_web_search"
    }, undefined, config);

    assert.equal(records.length, 1);
    assert.equal(records[0].engine, "tavily");
    assert.equal(records[0].toolName, "research_web_search");
    assert.deepEqual(records[0].results, [
      { snippet: "The result body", title: "Result title", url: "https://example.test/result" }
    ]);
    assert.equal(requests[0].api_key, "tavily-key");
    assert.equal(requests[0].max_results, 3);
    assert.equal(requests[0].query, "search query");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("gateway config does not create fallback tools for MCP-backed Fusion tools", () => {
  const profiles = [
    {
      enabled: true,
      tools: [
        { description: "Browser search", name: "fusion_2_web_search", visibility: "internal" },
        { description: "Vision", name: "vision_understand_glm_5_2v", visibility: "internal" },
        { description: "Missing", name: "missing_fusion_tool", visibility: "internal" }
      ]
    }
  ];
  const servers = [
    { name: "fusion_2_web_search" },
    { env: { FUSION_TOOL_NAME: "vision_understand_glm_5_2v" }, name: "fusion-vision-glm-5.2v" }
  ];

  const definitions = fusionFallbackToolDefinitions(profiles, fusionToolNamesBackedByMcpServers(servers));

  assert.deepEqual(definitions.map((definition) => definition.name), ["missing_fusion_tool"]);
});

test("gateway fallback explains In-app Browser web search requires Desktop integration", () => {
  const profiles = [
    {
      enabled: true,
      metadata: {
        fusionWebSearch: { provider: "browser", toolName: "fusion_2_web_search" }
      },
      tools: [{ description: "Browser search", name: "fusion_2_web_search", visibility: "internal" }]
    }
  ];

  const definitions = fusionFallbackToolDefinitions(profiles);

  assert.equal(definitions[0].name, "fusion_2_web_search");
  assert.match(definitions[0].unavailableMessage, /requires CCR Desktop/);
  assert.match(definitions[0].unavailableMessage, /switch the Fusion web search provider/);
});

test("gateway response injects Anthropic web search protocol blocks into JSON responses", () => {
  const response = {
    content: [
      { thinking: "searched", type: "thinking" },
      { text: "answer", type: "text" }
    ],
    id: "msg_1",
    role: "assistant",
    stop_reason: "tool_use",
    type: "message",
    usage: { server_tool_use: { web_search_requests: 1 } }
  };
  const transformed = transformAnthropicWebSearchProtocolResponseValue(response, [sampleSearchRecord()], "req-1");

  assert.equal(transformed.changed, true);
  assert.deepEqual(
    transformed.value.content.map((block) => block.type),
    ["thinking", "server_tool_use", "web_search_tool_result", "text"]
  );
  assert.equal(transformed.value.content[1].name, "web_search");
  assert.equal(transformed.value.content[2].content[0].type, "web_search_result");
  assert.equal(transformed.value.content[2].content[0].snippet, "Search snippet: Spot gold traded near $3,340 per ounce.");
  assert.equal(transformed.value.stop_reason, "end_turn");
});

test("gateway preserves Anthropic tool_use stop reason when client tools remain", () => {
  const response = {
    content: [
      { thinking: "searched", type: "thinking" },
      { id: "toolu_1", input: { command: "pwd" }, name: "Bash", type: "tool_use" }
    ],
    id: "msg_1",
    role: "assistant",
    stop_reason: "tool_use",
    type: "message",
    usage: {}
  };
  const transformed = transformAnthropicWebSearchProtocolResponseValue(response, [sampleSearchRecord()], "req-1");

  assert.equal(transformed.changed, true);
  assert.deepEqual(
    transformed.value.content.map((block) => block.type),
    ["thinking", "server_tool_use", "web_search_tool_result", "tool_use"]
  );
  assert.equal(transformed.value.stop_reason, "tool_use");
});

test("gateway injects prefetched web search evidence into Anthropic requests", () => {
  const body = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: [{ type: "text", text: "北京天气怎么样" }] }],
    model: "Fusion/kimisearch",
    output_config: { effort: "high" },
    system: [{ type: "text", text: "Answer in Chinese." }],
    thinking: { type: "enabled" },
    tools: [{ name: "web_search", type: "web_search_20250305" }]
  }));
  const record = sampleSearchRecord();
  record.results[0].content = "北京市当前天气晴，气温 28 摄氏度，空气质量良。";

  const transformed = prepareAnthropicWebSearchProtocolRequestBody(body, [record], { queryHint: "北京天气怎么样" });
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.match(parsed.system[1].text, /Use the evidence below to answer the user's question directly/);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed.tool_choice, undefined);
  assert.equal(parsed.output_config.effort, "low");
  assert.equal(parsed.thinking, undefined);
  assert.match(parsed.system[1].text, /北京市当前天气晴/);
});

test("gateway forces Claude Code WebSearch continuations to answer without tools", () => {
  const body = Buffer.from(JSON.stringify({
    messages: [
      { role: "user", content: [{ type: "text", text: "搜索 shadcn官方有哪些New Components" }] },
      {
        role: "assistant",
        content: [
          {
            id: "tool_search_1",
            input: { query: "shadcn UI new components 2025 2026 official" },
            name: "WebSearch",
            type: "tool_use"
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            content: "Web search results for query: \"shadcn UI new components 2025 2026 official\"\n\nLinks: [{\"title\":\"Changelog - Shadcn UI\",\"url\":\"https://ui.shadcn.com/docs/changelog\"}]\n\nThe official shadcn/ui changelog lists June 2026 chat interface components. REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.",
            tool_use_id: "tool_search_1",
            type: "tool_result"
          }
        ]
      }
    ],
    model: "Fusion/kimisearch",
    output_config: { effort: "high" },
    system: [{ type: "text", text: "You are Claude Code." }],
    thinking: { type: "enabled" },
    tools: [
      { name: "WebFetch", input_schema: { type: "object" } },
      { name: "WebSearch", input_schema: { type: "object" } },
      { name: "Bash", input_schema: { type: "object" } }
    ]
  }));

  const transformed = prepareClaudeCodeWebSearchContinuationRequestBody(
    body,
    [sampleSearchRecord()],
    { queryHint: "shadcn UI new components 2025 2026 official" }
  );
  assert.ok(transformed);
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.equal(parsed.tools, undefined);
  assert.equal(parsed.tool_choice, undefined);
  assert.equal(parsed.output_config.effort, "low");
  assert.equal(parsed.thinking, undefined);
  assert.match(parsed.system.at(-1).text, /Do not call any tool/);
  assert.match(parsed.system.at(-1).text, /In-app browser extracted evidence/);
  assert.match(parsed.system.at(-1).text, /Previous WebSearch tool result/);
  assert.match(parsed.system.at(-1).text, /Spot gold traded near \$3,340 per ounce/);
});

test("gateway ignores stale Claude Code WebSearch results on later turns", () => {
  const body = Buffer.from(JSON.stringify({
    messages: [
      { role: "user", content: [{ type: "text", text: "搜索 shadcn官方有哪些New Components" }] },
      {
        role: "assistant",
        content: [
          {
            id: "tool_search_1",
            input: { query: "shadcn UI new components 2025 2026 official" },
            name: "WebSearch",
            type: "tool_use"
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            content: "Web search results for query: \"shadcn UI new components 2025 2026 official\"\n\nLinks: []",
            tool_use_id: "tool_search_1",
            type: "tool_result"
          }
        ]
      },
      { role: "assistant", content: [{ type: "text", text: "The changelog has new chat components." }] },
      { role: "user", content: [{ type: "text", text: "Now inspect package.json with Bash." }] }
    ],
    model: "Fusion/kimisearch",
    system: [{ type: "text", text: "You are Claude Code." }],
    tools: [
      { name: "WebFetch", input_schema: { type: "object" } },
      { name: "WebSearch", input_schema: { type: "object" } },
      { name: "Bash", input_schema: { type: "object" } }
    ]
  }));

  const transformed = prepareClaudeCodeWebSearchContinuationRequestBody(
    body,
    [sampleSearchRecord()],
    { queryHint: undefined }
  );

  assert.equal(transformed, undefined);
});

test("gateway synthesizes final Anthropic text when web search response has no visible answer", () => {
  const response = {
    content: [
      { thinking: "searched but did not answer", type: "thinking" }
    ],
    id: "msg_1",
    role: "assistant",
    stop_reason: "max_tokens",
    type: "message",
    usage: { output_tokens: 0 }
  };
  const transformed = transformAnthropicWebSearchProtocolResponseValue(
    response,
    [sampleSearchRecord()],
    "req-1",
    "today gold price per ounce USD July 2026"
  );

  assert.equal(transformed.changed, true);
  assert.deepEqual(
    transformed.value.content.map((block) => block.type),
    ["thinking", "server_tool_use", "web_search_tool_result", "text"]
  );
  assert.match(transformed.value.content[3].text, /Spot gold traded near \$3,340 per ounce/);
  assert.equal(transformed.value.usage.server_tool_use.web_search_requests, 1);
  assert.equal(transformed.value.stop_reason, "end_turn");
});

test("gateway hosted web search response stream uses prefetched records without browser integration", async () => {
  const response = {
    content: [
      { thinking: "searched but did not answer", type: "thinking" }
    ],
    id: "msg_1",
    role: "assistant",
    stop_reason: "max_tokens",
    type: "message",
    usage: { output_tokens: 0 }
  };
  const stream = hostedWebSearchProtocolResponseStream(
    Readable.from([Buffer.from(JSON.stringify(response), "utf8")]),
    new Headers({ "content-type": "application/json; charset=utf-8" }),
    {
      protocol: "anthropic_messages",
      queryHint: "today gold price per ounce USD July 2026",
      records: [sampleSearchRecord()],
      requestId: "req-1",
      sinceMs: Date.now() - 1000,
      toolName: "fusion_2_web_search"
    },
    undefined
  );

  const transformed = JSON.parse(await readStreamText(stream));

  assert.deepEqual(
    transformed.content.map((block) => block.type),
    ["thinking", "server_tool_use", "web_search_tool_result", "text"]
  );
  assert.match(transformed.content[3].text, /Spot gold traded near \$3,340 per ounce/);
});

test("gateway synthesizes useful component changelog answers from extracted pages", () => {
  const response = {
    content: [
      { thinking: "searched but did not answer", type: "thinking" }
    ],
    id: "msg_1",
    role: "assistant",
    stop_reason: "max_tokens",
    type: "message",
    usage: { output_tokens: 0 }
  };
  const transformed = transformAnthropicWebSearchProtocolResponseValue(
    response,
    [sampleShadcnSearchRecord()],
    "req-1",
    "shadcn ui new components 2025 2026 official registry"
  );

  assert.equal(transformed.changed, true);
  assert.match(transformed.value.content[2].content[0].snippet, /Extracted page content:/);
  assert.match(transformed.value.content[3].text, /June 2026 - Components for Chat Interfaces/);
  assert.match(transformed.value.content[3].text, /Message Scroller/);
  assert.match(transformed.value.content[3].text, /Attachment/);
  assert.doesNotMatch(transformed.value.content[3].text, /Morning, shadcn/);
});

test("gateway response injects Anthropic web search protocol blocks into SSE responses", () => {
  const sse = [
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
    sseEvent({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "answer" } }),
    sseEvent({ type: "content_block_stop", index: 1 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { server_tool_use: { web_search_requests: 1 } } }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n";

  const transformed = transformAnthropicWebSearchProtocolSseText(sse, [sampleSearchRecord()], "req-1");

  assert.match(transformed, /"type":"server_tool_use"/);
  assert.match(transformed, /"type":"web_search_tool_result"/);
  assert.match(transformed, /"type":"web_search_result"/);
  assert.match(transformed, /"index":3,"content_block":\{"type":"text"/);
  assert.match(transformed, /"server_tool_use":\{"web_search_requests":1\}/);
  assert.match(transformed, /"stop_reason":"end_turn"/);
});

test("gateway preserves Anthropic SSE tool_use stop reason when client tools remain", () => {
  const sse = [
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "content_block_start", index: 1, content_block: { id: "toolu_1", input: { command: "pwd" }, name: "Bash", type: "tool_use" } }),
    sseEvent({ type: "content_block_stop", index: 1 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: {} }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n";

  const transformed = transformAnthropicWebSearchProtocolSseText(sse, [sampleSearchRecord()], "req-1");

  assert.match(transformed, /"type":"server_tool_use"/);
  assert.match(transformed, /"type":"tool_use"/);
  assert.match(transformed, /"stop_reason":"tool_use"/);
  assert.doesNotMatch(transformed, /"stop_reason":"end_turn"/);
});

test("gateway hosted web search response stream transforms Anthropic SSE responses", async () => {
  const sse = [
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    sseEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "reasoning" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
    sseEvent({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "answer" } }),
    sseEvent({ type: "content_block_stop", index: 1 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: {} }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n";
  const stream = hostedWebSearchProtocolResponseStream(
    Readable.from([Buffer.from(sse, "utf8")]),
    new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
    {
      protocol: "anthropic_messages",
      queryHint: "today gold price per ounce USD July 2026",
      records: [sampleSearchRecord()],
      requestId: "req-1",
      sinceMs: Date.now() - 1000,
      toolName: "fusion_2_web_search"
    },
    {
      recentBrowserWebSearchResults: () => [],
      stopBrowserWebSearchMcpServers: async () => {}
    }
  );

  const transformed = await readStreamText(stream);

  assert.match(transformed, /"type":"server_tool_use"/);
  assert.match(transformed, /"type":"web_search_tool_result"/);
  assert.match(transformed, /"type":"web_search_result"/);
  assert.match(transformed, /"server_tool_use":\{"web_search_requests":1\}/);
  assert.match(transformed, /"stop_reason":"end_turn"/);
});

test("gateway hosted web search Anthropic SSE stream emits before upstream ends", async () => {
  const input = new PassThrough();
  const stream = hostedWebSearchProtocolResponseStream(
    input,
    new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
    {
      protocol: "anthropic_messages",
      queryHint: "today gold price per ounce USD July 2026",
      records: [sampleSearchRecord()],
      requestId: "req-1",
      sinceMs: Date.now() - 1000,
      toolName: "fusion_2_web_search"
    },
    {
      recentBrowserWebSearchResults: () => [],
      stopBrowserWebSearchMcpServers: async () => {}
    }
  );

  const injectedData = waitForStreamDataMatching(stream, /"type":"server_tool_use"/, 500);
  input.write([
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
  ].join("\n\n") + "\n\n");
  const chunk = await injectedData;
  assert.ok(chunk);
  assert.match(chunk.toString("utf8"), /"type":"server_tool_use"/);

  input.end([
    sseEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "answer" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: {} }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n");
  const rest = await readStreamText(stream);
  assert.match(`${chunk.toString("utf8")}${rest}`, /"stop_reason":"end_turn"/);
});

test("gateway synthesizes final Anthropic SSE text when model exhausts tokens in thinking", () => {
  const sse = [
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    sseEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "long reasoning" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 0 } }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n";

  const transformed = transformAnthropicWebSearchProtocolSseText(
    sse,
    [sampleSearchRecord()],
    "req-1",
    "today gold price per ounce USD July 2026"
  );

  assert.match(transformed, /"type":"server_tool_use"/);
  assert.match(transformed, /"type":"web_search_tool_result"/);
  assert.match(transformed, /"delta":\{"text":"Based on the search results, Spot gold traded near \$3,340 per ounce/);
  assert.match(transformed, /"stop_reason":"end_turn"/);
  assert.match(transformed, /"server_tool_use":\{"web_search_requests":1\}/);
});

test("gateway injects prefetched web search evidence into OpenAI chat requests", () => {
  const body = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Perform a web search for the query: today gold price per ounce USD July 2026" }],
    model: "Fusion/kimisearch",
    tool_choice: "auto",
    tools: [{ type: "web_search_preview" }],
    web_search_options: { search_context_size: "low" }
  }));

  const transformed = prepareHostedWebSearchProtocolRequestBody(body, [sampleSearchRecord()], {
    protocol: "openai_chat_completions",
    queryHint: "today gold price per ounce USD July 2026"
  });
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.equal(parsed.tools, undefined);
  assert.equal(parsed.tool_choice, undefined);
  assert.equal(parsed.web_search_options, undefined);
  assert.equal(parsed.messages[0].role, "system");
  assert.match(parsed.messages[0].content, /hidden in-app browser web search/);
});

test("gateway includes browser extraction diagnostics in hosted web search evidence", () => {
  const body = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "Perform a web search for the query: today gold price per ounce USD July 2026" }],
    model: "Fusion/kimisearch",
    tools: [{ type: "web_search_preview" }]
  }));
  const record = sampleSearchRecord();
  record.results[0].diagnostics = ["Page extraction failed: Browser search navigation timed out."];

  const transformed = prepareHostedWebSearchProtocolRequestBody(body, [record], {
    protocol: "openai_chat_completions",
    queryHint: "today gold price per ounce USD July 2026"
  });
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.match(parsed.messages[0].content, /Diagnostics: Page extraction failed/);
});

test("gateway hosted web search rewrites preserve custom web_search-named tools", () => {
  const anthropicBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "search docs" }],
    model: "Fusion/kimisearch",
    tool_choice: { name: "web_search_docs", type: "tool" },
    tools: [
      { input_schema: { type: "object" }, name: "web_search_docs" },
      { name: "web_search", type: "web_search_20250305" }
    ]
  }));
  const anthropicParsed = JSON.parse(prepareAnthropicWebSearchProtocolRequestBody(
    anthropicBody,
    [sampleSearchRecord()],
    { queryHint: "search docs" }
  ).toString("utf8"));

  assert.deepEqual(anthropicParsed.tools.map((tool) => tool.name), ["web_search_docs"]);
  assert.equal(anthropicParsed.tool_choice.name, "web_search_docs");

  const openAiBody = Buffer.from(JSON.stringify({
    messages: [{ role: "user", content: "search docs" }],
    model: "Fusion/kimisearch",
    parallel_tool_calls: true,
    tool_choice: { function: { name: "web_search_docs" }, type: "function" },
    tools: [
      { function: { name: "web_search_docs", parameters: { type: "object" } }, type: "function" },
      { type: "web_search_preview" }
    ],
    web_search_options: { search_context_size: "low" }
  }));
  const openAiParsed = JSON.parse(prepareHostedWebSearchProtocolRequestBody(
    openAiBody,
    [sampleSearchRecord()],
    { protocol: "openai_chat_completions", queryHint: "search docs" }
  ).toString("utf8"));

  assert.deepEqual(openAiParsed.tools.map((tool) => tool.function.name), ["web_search_docs"]);
  assert.equal(openAiParsed.tool_choice.function.name, "web_search_docs");
  assert.equal(openAiParsed.parallel_tool_calls, true);

  const geminiBody = Buffer.from(JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "search docs" }] }],
    tools: [
      {
        functionDeclarations: [{ name: "web_search_docs", parameters: { type: "object" } }],
        google_search: {}
      }
    ]
  }));
  const geminiParsed = JSON.parse(prepareHostedWebSearchProtocolRequestBody(
    geminiBody,
    [sampleSearchRecord()],
    { protocol: "gemini_generate_content", queryHint: "search docs" }
  ).toString("utf8"));

  assert.deepEqual(geminiParsed.tools[0].functionDeclarations.map((declaration) => declaration.name), ["web_search_docs"]);
  assert.equal(geminiParsed.tools[0].google_search, undefined);
});

test("gateway synthesizes OpenAI chat final text for hosted web search fallback", () => {
  const response = {
    choices: [
      { finish_reason: "length", index: 0, message: { role: "assistant", content: "" } }
    ],
    id: "chatcmpl_1",
    object: "chat.completion"
  };
  const transformed = transformOpenAiChatHostedWebSearchResponseValue(
    response,
    [sampleSearchRecord()],
    "today gold price per ounce USD July 2026"
  );

  assert.equal(transformed.changed, true);
  assert.match(transformed.value.choices[0].message.content, /Spot gold traded near \$3,340 per ounce/);
  assert.equal(transformed.value.choices[0].finish_reason, "stop");
});

test("gateway synthesizes OpenAI chat SSE final text for hosted web search fallback", () => {
  const sse = [
    openAiSseEvent({ id: "chatcmpl_1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
    openAiSseEvent({ id: "chatcmpl_1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "length" }] }),
    "data: [DONE]"
  ].join("\n\n") + "\n\n";

  const transformed = transformOpenAiChatHostedWebSearchSseText(
    sse,
    [sampleSearchRecord()],
    "today gold price per ounce USD July 2026"
  );

  assert.match(transformed, /"delta":\{"content":"Based on the search results, Spot gold traded near \$3,340 per ounce/);
  assert.match(transformed, /"finish_reason":"stop"/);
});

test("gateway injects prefetched web search evidence into OpenAI responses requests", () => {
  const body = Buffer.from(JSON.stringify({
    input: "Perform a web search for the query: today gold price per ounce USD July 2026",
    model: "Fusion/kimisearch",
    tools: [{ type: "web_search_preview" }],
    tool_choice: "auto"
  }));

  const transformed = prepareHostedWebSearchProtocolRequestBody(body, [sampleSearchRecord()], {
    protocol: "openai_responses",
    queryHint: "today gold price per ounce USD July 2026"
  });
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.equal(parsed.tools, undefined);
  assert.equal(parsed.tool_choice, undefined);
  assert.match(parsed.instructions, /hidden in-app browser web search/);
});

test("gateway extracts OpenAI responses web search query after Codex runtime context", () => {
  const body = {
    input: [
      {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "<permissions instructions>\nNetwork access is restricted.\n</permissions instructions>" }]
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "<environment_context>\n  <cwd>/tmp/project</cwd>\n  <current_date>2026-07-02</current_date>\n  <filesystem></filesystem>\n</environment_context>" }]
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "之前的回答" }]
      },
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "搜索今天黄金价格" }]
      }
    ],
    model: "Fusion/kimisearch",
    tools: [{ type: "web_search_preview" }]
  };

  assert.equal(extractHostedWebSearchQueryHint(body, "openai_responses"), "今天黄金价格");
});

test("gateway synthesizes OpenAI responses output for hosted web search fallback", () => {
  const response = {
    id: "resp_1",
    output: [],
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" }
  };
  const transformed = transformOpenAiResponsesHostedWebSearchResponseValue(
    response,
    [sampleSearchRecord()],
    "req-1",
    "today gold price per ounce USD July 2026"
  );

  assert.equal(transformed.changed, true);
  assert.deepEqual(transformed.value.output.map((item) => item.type), ["web_search_call", "message"]);
  assert.match(transformed.value.output[1].content[0].text, /Spot gold traded near \$3,340 per ounce/);
  assert.equal(transformed.value.status, "completed");
});

test("gateway synthesizes OpenAI responses SSE output for hosted web search fallback", () => {
  const sse = [
    openAiSseEvent({ type: "response.created", response: { id: "resp_1", status: "in_progress" } }),
    openAiSseEvent({ type: "response.completed", response: { id: "resp_1", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }),
    "data: [DONE]"
  ].join("\n\n") + "\n\n";

  const transformed = transformOpenAiResponsesHostedWebSearchSseText(
    sse,
    [sampleSearchRecord()],
    "req-1",
    "today gold price per ounce USD July 2026"
  );

  assert.match(transformed, /event: response.output_text.delta/);
  assert.match(transformed, /"type":"response.output_text.delta"/);
  assert.match(transformed, /Spot gold traded near \$3,340 per ounce/);
  assert.match(transformed, /"status":"completed"/);
});

test("gateway normalizes OpenAI responses SSE with visible text for hosted web search", () => {
  const answer = "杭州今天湿润有雨，气温约24℃到29.3℃。";
  const sse = [
    openAiSseEvent({ type: "response.created", response: { id: "resp_1", status: "in_progress", output: [] } }),
    openAiSseEvent({ type: "response.output_item.added", output_index: 0, item: { id: "rs_1", type: "reasoning", status: "in_progress", content: [] } }),
    openAiSseEvent({ type: "response.reasoning_text.delta", output_index: 0, content_index: 0, item_id: "rs_1", delta: "hidden reasoning" }),
    openAiSseEvent({ type: "response.output_item.added", output_index: 1, item: { id: "msg_1", type: "message", role: "assistant", status: "in_progress", content: [] } }),
    openAiSseEvent({ type: "response.content_part.added", output_index: 1, content_index: 0, item_id: "msg_1", part: { type: "output_text", text: "", annotations: [] } }),
    openAiSseEvent({ type: "response.output_text.delta", output_index: 1, content_index: 0, item_id: "msg_1", delta: answer }),
    openAiSseEvent({ type: "response.output_text.done", output_index: 1, content_index: 0, item_id: "msg_1", text: answer }),
    openAiSseEvent({ type: "response.output_item.done", output_index: 0, item: { id: "rs_1", type: "reasoning", status: "completed", content: [{ type: "reasoning_text", text: "hidden reasoning" }] } }),
    openAiSseEvent({ type: "response.output_item.done", output_index: 1, item: { id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: answer, annotations: [] }] } }),
    openAiSseEvent({
      type: "response.completed",
      response: {
        id: "resp_1",
        status: "completed",
        output_text: answer,
        output: [
          { id: "rs_1", type: "reasoning", status: "completed", content: [{ type: "reasoning_text", text: "hidden reasoning" }] },
          { id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: answer, annotations: [] }] }
        ]
      }
    }),
    "data: [DONE]"
  ].join("\n\n") + "\n\n";

  const transformed = transformOpenAiResponsesHostedWebSearchSseText(
    sse,
    [sampleSearchRecord()],
    "req-1",
    "杭州天气怎么样"
  );

  assert.match(transformed, /event: response.output_text.delta/);
  assert.match(transformed, /"output_index":0/);
  assert.match(transformed, /"output_text":"杭州今天湿润有雨/);
  assert.doesNotMatch(transformed, /"output_index":1/);
  assert.doesNotMatch(transformed, /response.reasoning_text.delta/);
  assert.doesNotMatch(transformed, /"type":"reasoning"/);
});

test("gateway injects prefetched web search evidence into Gemini requests", () => {
  const body = Buffer.from(JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Perform a web search for the query: today gold price per ounce USD July 2026" }] }],
    tools: [{ google_search: {} }]
  }));

  const transformed = prepareHostedWebSearchProtocolRequestBody(body, [sampleSearchRecord()], {
    protocol: "gemini_generate_content",
    queryHint: "today gold price per ounce USD July 2026"
  });
  const parsed = JSON.parse(transformed.toString("utf8"));

  assert.equal(parsed.tools, undefined);
  assert.match(parsed.systemInstruction.parts[0].text, /hidden in-app browser web search/);
});

test("gateway synthesizes Gemini response text for hosted web search fallback", () => {
  const response = { candidates: [{ content: { parts: [], role: "model" }, finishReason: "MAX_TOKENS", index: 0 }] };
  const transformed = transformGeminiHostedWebSearchResponseValue(
    response,
    [sampleSearchRecord()],
    "today gold price per ounce USD July 2026"
  );

  assert.equal(transformed.changed, true);
  assert.match(transformed.value.candidates[0].content.parts[0].text, /Spot gold traded near \$3,340 per ounce/);
  assert.equal(transformed.value.candidates[0].finishReason, "STOP");
});

test("gateway synthesizes Gemini SSE text for hosted web search fallback", () => {
  const sse = [
    openAiSseEvent({ candidates: [{ content: { parts: [], role: "model" }, finishReason: "MAX_TOKENS", index: 0 }] }),
    "data: [DONE]"
  ].join("\n\n") + "\n\n";

  const transformed = transformGeminiHostedWebSearchSseText(
    sse,
    [sampleSearchRecord()],
    "today gold price per ounce USD July 2026"
  );

  assert.match(transformed, /"candidates":\[\{"content":\{"parts":\[\{"text":"Based on the search results, Spot gold traded near \$3,340 per ounce/);
});

function sampleSearchRecord() {
  return {
    completedAtMs: Date.now(),
    engine: "google",
    query: "today gold price per ounce USD July 2026",
    results: [
      {
        snippet: "Spot gold traded near $3,340 per ounce.",
        title: "Gold Price Today",
        url: "https://example.test/gold"
      }
    ],
    searchUrl: "https://www.google.com/search?q=gold",
    toolName: "fusion_2_web_search"
  };
}

function sampleShadcnSearchRecord() {
  return {
    completedAtMs: Date.now(),
    engine: "google",
    query: "shadcn ui new components 2025 2026 official registry",
    results: [
      {
        content: "Sections Introduction Components Attachment Avatar Badge Bubble Button Button Group Empty Field Input Input Group Input OTP Item Marker Message Message Scroller Native Select Changelog RSS Latest updates and announcements. June 2026 - Components for Chat Interfaces New Chat How can I help you today? Morning, shadcn! What are we working on today?",
        title: "Changelog - Shadcn UI",
        url: "https://ui.shadcn.com/docs/changelog"
      },
      {
        snippet: "YouTube · Web Dev Simplified 26.3K+ views · 11 months ago",
        title: "How I Built My Own Shadcn Library",
        url: "https://www.youtube.com/watch?v=example"
      }
    ],
    searchUrl: "https://www.google.com/search?q=shadcn",
    toolName: "fusion_2_web_search"
  };
}

function sseEvent(value) {
  return `event: ${value.type}\ndata: ${JSON.stringify(value)}`;
}

function openAiSseEvent(value) {
  return `data: ${JSON.stringify(value)}`;
}

async function readStreamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function waitForStreamDataMatching(stream, pattern, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!pattern.test(buffer.toString("utf8"))) {
        return;
      }
      cleanup();
      resolve(buffer);
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
    };
    stream.on("data", onData);
  });
}
