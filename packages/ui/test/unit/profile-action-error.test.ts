import assert from "node:assert/strict";
import test from "node:test";
import {
  createProfileActionError,
  profileActionErrorAfterGatewayStatus
} from "@ccr/ui/pages/home/shared/profiles.ts";

test("gateway recovery clears a gateway profile action error", () => {
  const error = createProfileActionError(
    "listen EADDRINUSE: address already in use 127.0.0.1:3456",
    "gateway"
  );

  assert.equal(profileActionErrorAfterGatewayStatus(error, "running"), undefined);
});

test("a gateway profile action error remains visible until recovery", () => {
  const error = createProfileActionError(
    "listen EADDRINUSE: address already in use 127.0.0.1:3456",
    "gateway"
  );

  assert.equal(profileActionErrorAfterGatewayStatus(error, "error"), error);
  assert.equal(profileActionErrorAfterGatewayStatus(error, "starting"), error);
});

test("gateway recovery does not clear a profile validation error", () => {
  const error = createProfileActionError("Select a model before saving.");

  assert.equal(profileActionErrorAfterGatewayStatus(error, "running"), error);
});
