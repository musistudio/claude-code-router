import assert from "node:assert/strict";
import test from "node:test";
import { bailianProviderPreset } from "@ccr/core/providers/presets/bailian/index.ts";
import { nvidiaProviderPreset } from "@ccr/core/providers/presets/nvidia/index.ts";
import {
  findProviderPresetByBaseUrlInList,
  providerPresetHasTemplateEndpoints,
  providerPresetMatchesBaseUrl,
  providerPresetTemplateEndpointVariablesForBaseUrlInList,
  substituteProviderPresetEndpointVariables
} from "@ccr/core/providers/presets/utils.ts";

const workspaceRegions = bailianProviderPreset.endpoints
  .flatMap((endpoint) => endpoint.variables ?? [])
  .find((variable) => variable.name === "Region")?.options ?? [];
const openaiTemplateEndpoint = bailianProviderPreset.endpoints[2];

test("bailian preset keeps a static DashScope endpoint as the primary endpoint", () => {
  assert.equal(bailianProviderPreset.endpoints[0].baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  assert.equal(bailianProviderPreset.endpoints[1].baseUrl, "https://dashscope.aliyuncs.com/apps/anthropic");
  assert.ok(providerPresetHasTemplateEndpoints(bailianProviderPreset));
  assert.ok(!providerPresetHasTemplateEndpoints(nvidiaProviderPreset));
});

for (const region of workspaceRegions) {
  test(`workspace domain baseUrl in ${region.value} resolves back to the bailian preset`, () => {
    const openaiUrl = `https://ws-unit.${region.value}.maas.aliyuncs.com/compatible-mode/v1`;
    const anthropicUrl = `https://ws-unit.${region.value}.maas.aliyuncs.com/apps/anthropic`;
    for (const baseUrl of [openaiUrl, anthropicUrl]) {
      assert.equal(findProviderPresetByBaseUrlInList([bailianProviderPreset], baseUrl)?.id, "bailian");
      assert.ok(providerPresetMatchesBaseUrl(bailianProviderPreset, baseUrl));
    }
  });
}

test("workspace host matching stays anchored to the template label count and path", () => {
  const presets = [bailianProviderPreset];
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://extra.ws-unit.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"), undefined);
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://ws-unit.cn-beijing.maas.example.com/compatible-mode/v1"), undefined);
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://ws-unit.cn-beijing.maas.aliyuncs.com/other/path"), undefined);
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://maas.aliyuncs.com/compatible-mode/v1"), undefined);
});

test("dashscope baseUrls still resolve back to the bailian preset", () => {
  const presets = [bailianProviderPreset];
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://dashscope.aliyuncs.com/compatible-mode/v1")?.id, "bailian");
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://dashscope.aliyuncs.com/apps/anthropic")?.id, "bailian");
  assert.equal(findProviderPresetByBaseUrlInList(presets, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")?.id, "bailian");
});

test("template endpoint variables are extracted from a filled workspace baseUrl", () => {
  const variables = providerPresetTemplateEndpointVariablesForBaseUrlInList(
    [bailianProviderPreset],
    "https://ws-unit.ap-southeast-1.maas.aliyuncs.com/apps/anthropic"
  );
  assert.deepEqual(variables, { WorkspaceId: "ws-unit", Region: "ap-southeast-1" });
  assert.equal(
    providerPresetTemplateEndpointVariablesForBaseUrlInList([bailianProviderPreset], "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    undefined
  );
});

test("template endpoint substitution fills placeholders and validates values", () => {
  assert.equal(
    substituteProviderPresetEndpointVariables(openaiTemplateEndpoint, { WorkspaceId: "ws-unit", Region: "cn-beijing" }),
    "https://ws-unit.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
  );
  assert.equal(
    substituteProviderPresetEndpointVariables(openaiTemplateEndpoint, { Region: "cn-beijing" }),
    undefined
  );
  assert.equal(
    substituteProviderPresetEndpointVariables(openaiTemplateEndpoint, { WorkspaceId: "bad_value", Region: "cn-beijing" }),
    undefined
  );
  assert.equal(
    substituteProviderPresetEndpointVariables(openaiTemplateEndpoint, { WorkspaceId: "bad.value", Region: "cn-beijing" }),
    undefined
  );
  assert.equal(
    substituteProviderPresetEndpointVariables(openaiTemplateEndpoint, { WorkspaceId: "ws-unit", Region: "not-a-region" }),
    undefined
  );
  assert.equal(
    substituteProviderPresetEndpointVariables(bailianProviderPreset.endpoints[0], {}),
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
});
