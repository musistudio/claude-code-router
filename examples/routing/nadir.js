// CCR Node.js route script body. Configure the environment before enabling.
// API contract: https://getnadir.com/docs/decision-api
if (api.env("CCR_NADIR_ROUTING_ENABLED") !== "1" || input.model !== "auto") return null;
if (input.summary.hasImage || !input.summary.lastUserText.trim()) return null;
const simple = api.env("CCR_NADIR_SIMPLE_MODEL");
const complex = api.env("CCR_NADIR_COMPLEX_MODEL");
if (!simple || !complex) return null;
// Without a medium model, medium prompts go to the complex model.
const targets = { simple, medium: api.env("CCR_NADIR_MEDIUM_MODEL") || complex, complex };
const key = api.env("NADIR_API_KEY");
const base = (api.env("CCR_NADIR_BASE_URL") || "https://api.getnadir.com").replace(/\/+$/, "").replace(/\/v1$/, "");
try {
  const response = await api.fetch(base + "/v1/bucket", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) },
    body: JSON.stringify({ prompt: input.summary.lastUserText.slice(0, 8192), source: "claude-code-router" })
  });
  if (!response.ok) return null;
  const bucket = JSON.parse(response.body)?.bucket;
  if (typeof bucket !== "string" || !Object.hasOwn(targets, bucket)) return null;
  return { model: targets[bucket] };
} catch {
  return null;
}
