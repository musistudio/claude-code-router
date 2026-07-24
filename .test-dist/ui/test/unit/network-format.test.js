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

// packages/ui/test/unit/network-format.test.ts
var import_strict = __toESM(require("node:assert/strict"));
var import_node_test = __toESM(require("node:test"));

// packages/ui/src/pages/home/shared/network.ts
function formatRouteTracePath(change) {
  const segments = change.path.split("/").filter(Boolean).map(decodeJsonPointerSegment);
  const direction = segments[0] === "request" || segments[0] === "response" ? segments.shift() : "request";
  const area = change.scope === "headers" ? "header" : change.scope;
  if (segments[0] === area || area === "header" && (segments[0] === "header" || segments[0] === "headers")) {
    segments.shift();
  }
  return [direction, area, ...segments].filter(Boolean).join(".");
}
function decodeJsonPointerSegment(value) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

// packages/ui/test/unit/network-format.test.ts
(0, import_node_test.default)("route trace paths use request and response dotted notation", () => {
  import_strict.default.equal(
    formatRouteTracePath({ path: "/body/model", scope: "body" }),
    "request.body.model"
  );
  import_strict.default.equal(
    formatRouteTracePath({ path: "/headers/content-type", scope: "headers" }),
    "request.header.content-type"
  );
  import_strict.default.equal(
    formatRouteTracePath({ path: "/response/body/output/0/text", scope: "body" }),
    "response.body.output.0.text"
  );
  import_strict.default.equal(
    formatRouteTracePath({ path: "/response/headers/x-request-id", scope: "headers" }),
    "response.header.x-request-id"
  );
  import_strict.default.equal(
    formatRouteTracePath({ path: "/routing/model", scope: "routing" }),
    "request.routing.model"
  );
  import_strict.default.equal(
    formatRouteTracePath({ path: "/url", scope: "url" }),
    "request.url"
  );
});
