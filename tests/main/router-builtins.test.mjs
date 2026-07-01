import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeCodeRouterPlugin } from "../../src/server/gateway/claude-code-router-plugin.ts";

function createRouterPlugin(options = {}) {
  const agent = options.agent ?? "claude-code";
  return new ClaudeCodeRouterPlugin({
    CUSTOM_ROUTER_PATH: "",
    Providers: [
      {
        modelDescriptions: options.modelDescriptions,
        modelDisplayNames: options.modelDisplayNames,
        models: ["claude-sonnet", "gpt-5-codex"],
        name: "Provider",
        type: "anthropic_messages"
      }
    ],
    Router: {
      builtInRules: {
        "claude-code": { enabled: options.claudeCodeRuleEnabled ?? true },
        codex: { enabled: options.codexRuleEnabled ?? true }
      },
      default: options.defaultModel ?? "",
      fallback: { mode: "off", models: [], retryCount: 1 },
      rules: []
    },
    profile: {
      enabled: options.profileRuntimeEnabled ?? true,
      profiles: [
        {
          agent,
          enabled: options.profileEnabled ?? true,
          id: `${agent}-profile`,
          model: options.profileModel ?? "",
          name: agent,
          scope: "global"
        }
      ]
    }
  });
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

test("built-in Codex route can use Router.default when profile model is unset", async () => {
  const plugin = createRouterPlugin({
    agent: "codex",
    defaultModel: "Provider/gpt-5-codex"
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

  assert.equal(result.body.model, "Provider/gpt-5-codex");
  assert.equal(result.decision.reason, "builtin:codex");
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
    defaultModel: "Provider/gpt-5-codex"
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
