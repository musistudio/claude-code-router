"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/core/test/architecture/gateway-service-architecture.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_test = __toESM(require("node:test"), 1);
var gatewayRoot = import_node_path.default.join(process.cwd(), "packages", "core", "src", "gateway");
function typescriptFiles(directory) {
  return (0, import_node_fs.readdirSync)(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = import_node_path.default.join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(file);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [file] : [];
  });
}
(0, import_node_test.default)("gateway service remains a compatibility facade", () => {
  const serviceFile = import_node_path.default.join(gatewayRoot, "service.ts");
  const source = (0, import_node_fs.readFileSync)(serviceFile, "utf8");
  const implementationLines = source.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("*") && !line.startsWith("/*"));
  import_strict.default.ok(implementationLines.length <= 20);
  import_strict.default.doesNotMatch(source, /class\s+GatewayService/);
  import_strict.default.doesNotMatch(source, /node:http/);
  import_strict.default.match(source, /gateway\/application\/gateway-service/);
  import_strict.default.match(source, /routing\/protocol-endpoints/);
});
(0, import_node_test.default)("gateway implementation modules do not depend on the public facade", () => {
  const serviceFile = import_node_path.default.join(gatewayRoot, "service.ts");
  const reverseDependencies = typescriptFiles(gatewayRoot).filter((file) => file !== serviceFile).filter((file) => /(?:@ccr\/core|\.\.)\/gateway\/service/.test((0, import_node_fs.readFileSync)(file, "utf8")));
  import_strict.default.deepEqual(reverseDependencies, []);
});
(0, import_node_test.default)("core config compilation is separated from filesystem persistence", () => {
  const compiler = (0, import_node_fs.readFileSync)(
    import_node_path.default.join(gatewayRoot, "core-runtime", "config-compiler.ts"),
    "utf8"
  );
  const writer = (0, import_node_fs.readFileSync)(
    import_node_path.default.join(gatewayRoot, "core-runtime", "config-writer.ts"),
    "utf8"
  );
  import_strict.default.doesNotMatch(compiler, /node:fs|writeFileSync|mkdirSync/);
  import_strict.default.match(writer, /compileCoreGatewayConfig/);
  import_strict.default.match(writer, /writeFileSync/);
});
