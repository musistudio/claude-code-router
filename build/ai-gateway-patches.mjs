import { readFileSync } from "node:fs";
import path from "node:path";

// Build-time fixes for the bundled @the-next-ai/ai-gateway runtime. Each patch targets the exact
// minified text of a published release and is skipped once that text no longer appears, so a
// gateway bump that carries the upstream fix needs no change here.

// ai-gateway 1.0.21: a virtual-model profile on a same-protocol upstream (anthropic_messages client
// -> anthropic_messages provider) streamed through the OpenAI-shaped protocol converter, which drops
// every Anthropic content_block_* event. Clients got message_start/message_delta/message_stop only:
// no content, model "unknown", usage still billed. Relay the stream verbatim when no conversion is
// needed, as the non-virtual path does.
// https://github.com/musistudio/claude-code-router/issues/1852
// https://github.com/The-NeXT-AI/ai-gateway/issues/32
const virtualModelSameProtocolStreamPatch = {
  id: "virtual-model-same-protocol-stream-passthrough",
  search:
    'u&&!k.hasInternalTools&&Se.ok&&RC(t,A,Se)){if(Us({sourceAdapter:t.adapterKey,targetProvider:A,targetProviderName:O?.name,mode:"live"}),Mn(r))return await Un(Se),Vn(n,Rt);let de=em(r,Se);return Zg(e,n,r,A,i.provider,t.adapterKey,R.length,xe,ue,Ie,Se.clone(),j,O,de,c).catch(yn=>{e.log.warn({provider:A,details:yn instanceof Error?yn.message:String(yn)},"Failed to process streaming billing event.")}),Tr(n,A,O?.name,R.length,O),kg(n,t,Se,E,c)}',
  replace:
    'u&&!k.hasInternalTools&&Se.ok&&RC(t,A,Se)){let ccrPassthroughStream=W1(t.adapterKey,i.provider,A,O);if(Us({sourceAdapter:t.adapterKey,targetProvider:A,targetProviderName:O?.name,mode:ccrPassthroughStream?"passthrough":"live"}),Mn(r))return await Un(Se),Vn(n,Rt);let de=em(r,Se);return Zg(e,n,r,A,i.provider,t.adapterKey,R.length,xe,ue,Ie,Se.clone(),j,O,de,c).catch(yn=>{e.log.warn({provider:A,details:yn instanceof Error?yn.message:String(yn)},"Failed to process streaming billing event.")}),Tr(n,A,O?.name,R.length,O),ccrPassthroughStream?(VP(t,u)&&Cl(n),Wo(n,Se,c)):kg(n,t,Se,E,c)}',
  // Minified helpers the replacement calls: canPassthroughWithoutProtocolConversion,
  // shouldForceEventStreamHeaders, forceEventStreamHeaders and relayUpstreamResponse.
  requiredDefinitions: [
    "function W1(e,n,t,r){if(n!==t)return!1;",
    'function VP(e,n){return n?e.adapterKey==="openai_responses"||e.adapterKey==="openai_chat":!1}',
    'function Cl(e){e.header("content-type","text/event-stream; charset=utf-8")',
    "function Wo(e,n,t){if(e.code(n.status)"
  ]
};

export const aiGatewayPatches = [virtualModelSameProtocolStreamPatch];

export function patchAiGatewaySource(source, patches = aiGatewayPatches) {
  const applied = [];
  let result = source;
  for (const patch of patches) {
    const occurrences = result.split(patch.search).length - 1;
    if (occurrences === 0) {
      continue;
    }
    if (occurrences > 1) {
      throw new Error(`ai-gateway patch ${patch.id} matched ${occurrences} locations; expected exactly one.`);
    }
    const missing = patch.requiredDefinitions.filter((definition) => !result.includes(definition));
    if (missing.length > 0) {
      throw new Error(`ai-gateway patch ${patch.id} cannot be applied; missing helpers: ${missing.join(", ")}`);
    }
    result = result.replace(patch.search, () => patch.replace);
    applied.push(patch.id);
  }
  return { applied, source: result };
}

export function aiGatewayPatchPlugin(gatewayPackageRoot) {
  const gatewayEntry = path.join(gatewayPackageRoot, "dist", "index.js");
  return {
    name: "ccr-ai-gateway-patches",
    setup(build) {
      build.onLoad({ filter: /[\\/]dist[\\/]index\.js$/ }, (args) => {
        if (path.resolve(args.path) !== gatewayEntry) {
          return undefined;
        }
        return { contents: patchAiGatewaySource(readFileSync(args.path, "utf8")).source, loader: "js" };
      });
    }
  };
}
