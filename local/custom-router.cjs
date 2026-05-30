/**
 * Local task-aware router for Claude Code Router.
 *
 * CCR calls this file with `(req, config, context)`. It returns
 * "provider,model" or null to fall back to CCR's built-in Router.
 *
 * Keep secrets in environment variables and config.json, not in this file.
 */

function textFromContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part) return "";
      if (typeof part === "string") return part;
      if (part.type === "text") return part.text || "";
      if (part.type === "tool_result") {
        return typeof part.content === "string"
          ? part.content
          : JSON.stringify(part.content || "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function latestUserText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return textFromContent(message.content);
    }
  }
  return "";
}

function classify(req, policy) {
  const body = req.body || {};
  const text = latestUserText(body.messages).toLowerCase();
  const tokenCount = Number(req.tokenCount || 0);
  const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;

  const longContextThreshold =
    Number(policy.longContextThreshold || 60000);
  const difficultTokenThreshold =
    Number(policy.difficultTokenThreshold || 24000);

  if (tokenCount >= longContextThreshold) return "longContext";
  if (body.thinking) return "think";

  if (
    text.includes("review") ||
    text.includes("审查") ||
    text.includes("评审") ||
    text.includes("architecture") ||
    text.includes("架构") ||
    text.includes("security") ||
    text.includes("安全") ||
    text.includes("审计") ||
    text.includes("audit")
  ) {
    return "review";
  }

  if (
    text.includes("debug") ||
    text.includes("fix") ||
    text.includes("修复") ||
    text.includes("root cause") ||
    text.includes("根因") ||
    text.includes("error") ||
    text.includes("错误") ||
    text.includes("报错") ||
    text.includes("故障") ||
    text.includes("failure")
  ) {
    return "repair";
  }

  if (
    tokenCount >= difficultTokenThreshold ||
    toolCount >= Number(policy.toolHeavyThreshold || 16)
  ) {
    return "complex";
  }

  if (
    text.includes("summarize") ||
    text.includes("总结") ||
    text.includes("format") ||
    text.includes("格式") ||
    text.includes("整理") ||
    text.includes("organize")
  ) {
    return "background";
  }

  return "default";
}

module.exports = async function router(req, config) {
  const policy = config.GatewayPolicy || {};
  const routes = policy.routes || {};
  const scenario = classify(req, policy);

  req.gatewayScenario = scenario;
  req.log?.info?.({
    scenario,
    tokenCount: req.tokenCount,
    sessionId: req.sessionId,
  }, "local gateway route decision");

  return routes[scenario] || routes.default || null;
};
