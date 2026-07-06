import assert from "node:assert/strict";
import test from "node:test";
import {
  createMcpServerDraftFromUnknown,
  mcpServerConfigFromDraft,
  validateMcpServerDraft
} from "../../packages/ui/src/pages/home/shared/virtual-models.ts";

test("MCP server drafts accept streamablehttp type alias", () => {
  const draft = createMcpServerDraftFromUnknown({
    headers: {
      Authorization: "Bearer YOUR_MCP_TOKEN"
    },
    name: "mcd-mcp",
    type: "streamablehttp",
    url: "https://mcp.mcd.cn"
  });

  assert.equal(draft.transport, "streamable-http");
  assert.equal(validateMcpServerDraft(draft), "");

  const config = mcpServerConfigFromDraft(draft, [], undefined);
  assert.equal(config.transport, "streamable-http");
  assert.equal(config.name, "mcd-mcp");
  assert.equal(config.url, "https://mcp.mcd.cn");
  assert.equal(config.headers.Authorization, "Bearer YOUR_MCP_TOKEN");
});
