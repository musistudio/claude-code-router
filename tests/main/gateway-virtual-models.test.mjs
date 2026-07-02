import assert from "node:assert/strict";
import test from "node:test";
import {
  fusionFallbackToolDefinitions,
  fusionWebSearchToolNameForRequest,
  fusionToolNamesBackedByMcpServers,
  extractHostedWebSearchQueryHint,
  prepareAnthropicWebSearchProtocolRequestBody,
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
} from "../../src/server/gateway/service.ts";

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

test("gateway resolves only browser-backed Fusion web search tools for hosted protocol bridging", () => {
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

  assert.equal(fusionWebSearchToolNameForRequest(config, "Fusion/research"), undefined);
  assert.equal(fusionWebSearchToolNameForRequest(config, "gpt-5"), undefined);
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

test("gateway response injects Anthropic web search protocol blocks into JSON responses", () => {
  const response = {
    content: [
      { thinking: "searched", type: "thinking" },
      { text: "answer", type: "text" }
    ],
    id: "msg_1",
    role: "assistant",
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
  assert.equal(transformed.value.content[2].content[0].snippet, "Spot gold traded near $3,340 per ounce.");
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

test("gateway response injects Anthropic web search protocol blocks into SSE responses", () => {
  const sse = [
    sseEvent({ type: "message_start", message: { content: [], id: "msg_1", role: "assistant", type: "message" } }),
    sseEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
    sseEvent({ type: "content_block_stop", index: 0 }),
    sseEvent({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
    sseEvent({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "answer" } }),
    sseEvent({ type: "content_block_stop", index: 1 }),
    sseEvent({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { server_tool_use: { web_search_requests: 1 } } }),
    sseEvent({ type: "message_stop" })
  ].join("\n\n") + "\n\n";

  const transformed = transformAnthropicWebSearchProtocolSseText(sse, [sampleSearchRecord()], "req-1");

  assert.match(transformed, /"type":"server_tool_use"/);
  assert.match(transformed, /"type":"web_search_tool_result"/);
  assert.match(transformed, /"type":"web_search_result"/);
  assert.match(transformed, /"index":3,"content_block":\{"type":"text"/);
  assert.match(transformed, /"server_tool_use":\{"web_search_requests":1\}/);
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

function sseEvent(value) {
  return `event: ${value.type}\ndata: ${JSON.stringify(value)}`;
}

function openAiSseEvent(value) {
  return `data: ${JSON.stringify(value)}`;
}
