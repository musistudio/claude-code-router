import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { aiGatewayPatches, patchAiGatewaySource } from "../../build/ai-gateway-patches.mjs";

const projectRoot = process.cwd();
const gatewayPackageRoot = path.join(projectRoot, "node_modules", "@the-next-ai", "ai-gateway");
const gatewayVersion = JSON.parse(readFileSync(path.join(gatewayPackageRoot, "package.json"), "utf8")).version;
const gatewaySource = readFileSync(path.join(gatewayPackageRoot, "dist", "index.js"), "utf8");
const [streamPatch] = aiGatewayPatches;

test("ai-gateway 1.0.21 relays same-protocol virtual-model streams verbatim", { skip: gatewayVersion !== "1.0.21" }, () => {
  const { applied, source } = patchAiGatewaySource(gatewaySource);

  assert.deepEqual(applied, ["virtual-model-same-protocol-stream-passthrough"]);
  assert.equal(source.includes(streamPatch.search), false);
  assert.equal(source.split(streamPatch.replace).length - 1, 1);
  assert.deepEqual(patchAiGatewaySource(source).applied, [], "patching an already patched bundle is a no-op");
});

test("ai-gateway patches skip bundles that no longer contain the target code", () => {
  const source = "function W1(){}";
  assert.deepEqual(patchAiGatewaySource(source), { applied: [], source });
});

test("ai-gateway patches refuse ambiguous or helper-less targets", () => {
  const helpers = streamPatch.requiredDefinitions.join(";");
  assert.throws(
    () => patchAiGatewaySource(`${helpers};${streamPatch.search};${streamPatch.search}`),
    /matched 2 locations/
  );
  assert.throws(() => patchAiGatewaySource(streamPatch.search), /missing helpers/);
  assert.deepEqual(patchAiGatewaySource(`${helpers};${streamPatch.search}`).applied, [streamPatch.id]);
});
