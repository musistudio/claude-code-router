import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const gatewayRoot = path.join(process.cwd(), "packages", "core", "src", "gateway");

function typescriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(file);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [file] : [];
  });
}

test("gateway service remains a compatibility facade", () => {
  const serviceFile = path.join(gatewayRoot, "service.ts");
  const source = readFileSync(serviceFile, "utf8");
  const implementationLines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("*") && !line.startsWith("/*"));

  assert.ok(implementationLines.length <= 20);
  assert.doesNotMatch(source, /class\s+GatewayService/);
  assert.doesNotMatch(source, /node:http/);
  assert.match(source, /gateway\/application\/gateway-service/);
  assert.match(source, /routing\/protocol-endpoints/);
});

test("gateway implementation modules do not depend on the public facade", () => {
  const serviceFile = path.join(gatewayRoot, "service.ts");
  const reverseDependencies = typescriptFiles(gatewayRoot)
    .filter((file) => file !== serviceFile)
    .filter((file) => /(?:@ccr\/core|\.\.)\/gateway\/service/.test(readFileSync(file, "utf8")));

  assert.deepEqual(reverseDependencies, []);
});

test("core config compilation is separated from filesystem persistence", () => {
  const compiler = readFileSync(
    path.join(gatewayRoot, "core-runtime", "config-compiler.ts"),
    "utf8"
  );
  const writer = readFileSync(
    path.join(gatewayRoot, "core-runtime", "config-writer.ts"),
    "utf8"
  );

  assert.doesNotMatch(compiler, /node:fs|writeFileSync|mkdirSync/);
  assert.match(writer, /compileCoreGatewayConfig/);
  assert.match(writer, /writeFileSync/);
});
