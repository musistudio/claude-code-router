import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_CODE_MCP_CONFIG_ENV,
  CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV,
  claudeCodeMcpConfigEnv,
  claudeCodeUtcTimezoneEnvOverride,
  isChinaTimeZone
} from "../../packages/core/src/agents/claude-code/environment.ts";
import { toolHubClaudeCodeMcpConfig } from "../../packages/core/src/mcp/toolhub-config.ts";

test("detects China time zones used by Claude Code", () => {
  assert.equal(isChinaTimeZone("Asia/Shanghai"), true);
  assert.equal(isChinaTimeZone("Asia/Urumqi"), true);
  assert.equal(isChinaTimeZone("PRC"), true);
  assert.equal(isChinaTimeZone("UTC"), false);
  assert.equal(isChinaTimeZone("Asia/Singapore"), false);
});

test("overrides Claude Code timezone only for China time zones", () => {
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("Asia/Shanghai"), { TZ: "UTC" });
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("UTC"), {});
  assert.deepEqual(claudeCodeUtcTimezoneEnvOverride("America/Los_Angeles"), {});
});

test("exports Claude Code MCP config path env for wrapper injection", () => {
  assert.deepEqual(claudeCodeMcpConfigEnv("/tmp/toolhub-mcp.json"), {
    [CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json",
    [CODEXL_CLAUDE_CODE_MCP_CONFIG_ENV]: "/tmp/toolhub-mcp.json"
  });
  assert.deepEqual(claudeCodeMcpConfigEnv(undefined), {});
});

test("builds Claude Code ToolHub MCP config when ToolHub has backend MCP servers", () => {
  const config = toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      llm: {
        apiKey: "resolver-key",
        baseUrl: "https://resolver.example/v1",
        model: "resolver-model"
      },
      maxTools: 10,
      mcpServers: [
        {
          headers: { Authorization: "Bearer token" },
          name: "mcd-mcp",
          transport: "streamable-http",
          url: "https://mcp.mcd.cn"
        }
      ],
      requestTimeoutMs: 60000
    }
  }, {
    command: "/Applications/CCR.app/Contents/MacOS/CCR",
    entryPath: "/Applications/CCR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"
  });

  assert.equal(Object.keys(config.mcpServers).length, 1);
  const server = config.mcpServers["ccr-toolhub"];
  assert.equal(server.command, "/Applications/CCR.app/Contents/MacOS/CCR");
  assert.deepEqual(server.args, ["/Applications/CCR.app/Contents/Resources/app/dist/main/toolhub-mcp.js"]);
  assert.equal(server.env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(server.env.TOOLHUB_OPENAI_MODEL, "resolver-model");
  assert.equal(server.env.TOOLHUB_MAX_TOOLS, "10");
  assert.equal(server.env.TOOLHUB_REQUEST_TIMEOUT_MS, "60000");
  assert.deepEqual(JSON.parse(server.env.TOOLHUB_MCP_SERVERS_JSON), [
    {
      headers: { Authorization: "Bearer token" },
      name: "mcd-mcp",
      transport: "streamable-http",
      url: "https://mcp.mcd.cn"
    }
  ]);
});

test("does not build Claude Code ToolHub MCP config without enabled backend servers", () => {
  assert.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: true,
      mcpServers: []
    }
  }), undefined);
  assert.equal(toolHubClaudeCodeMcpConfig({
    agent: {
      mcpServers: []
    },
    toolHub: {
      enabled: false,
      mcpServers: [
        {
          command: "node",
          name: "server",
          transport: "stdio"
        }
      ]
    }
  }), undefined);
});
