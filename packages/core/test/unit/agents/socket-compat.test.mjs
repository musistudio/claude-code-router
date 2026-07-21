import assert from "node:assert/strict";
import { Socket } from "node:net";
import test from "node:test";
import { installSocketTypeOfServiceCompat, isIgnorableSocketTypeOfServiceError } from "@ccr/core/platform/socket-compat.ts";

test("socket type-of-service compat ignores Electron EINVAL failures", () => {
  withSocketSetTypeOfService(() => {
    const error = new Error("setTypeOfService EINVAL");
    error.code = "EINVAL";
    throw error;
  }, () => {
    installSocketTypeOfServiceCompat();
    const socket = new Socket();

    assert.equal(socket.setTypeOfService(0), socket);
  });
});

test("socket type-of-service compat rethrows unrelated failures", () => {
  withSocketSetTypeOfService(() => {
    const error = new Error("setTypeOfService failed");
    error.code = "EACCES";
    throw error;
  }, () => {
    installSocketTypeOfServiceCompat();
    const socket = new Socket();

    assert.throws(() => socket.setTypeOfService(0), /setTypeOfService failed/);
  });
});

test("socket type-of-service error matcher is specific to setTypeOfService EINVAL", () => {
  const error = new Error("setTypeOfService EINVAL");
  error.code = "EINVAL";
  const connectError = new Error("connect EINVAL");
  connectError.code = "EINVAL";

  assert.equal(isIgnorableSocketTypeOfServiceError(error), true);
  assert.equal(isIgnorableSocketTypeOfServiceError(connectError), false);
  assert.equal(isIgnorableSocketTypeOfServiceError(new Error("setTypeOfService failed")), false);
});

function withSocketSetTypeOfService(fakeSetTypeOfService, run) {
  const stateSymbol = Symbol.for("ccr.socketTypeOfServiceCompatState");
  const prototype = Socket.prototype;
  const previousMethodDescriptor = Object.getOwnPropertyDescriptor(prototype, "setTypeOfService");
  const previousStateDescriptor = Object.getOwnPropertyDescriptor(prototype, stateSymbol);
  try {
    delete prototype[stateSymbol];
    Object.defineProperty(prototype, "setTypeOfService", {
      configurable: true,
      value: fakeSetTypeOfService,
      writable: true
    });
    run();
  } finally {
    if (previousMethodDescriptor) {
      Object.defineProperty(prototype, "setTypeOfService", previousMethodDescriptor);
    } else {
      delete prototype.setTypeOfService;
    }
    if (previousStateDescriptor) {
      Object.defineProperty(prototype, stateSymbol, previousStateDescriptor);
    } else {
      delete prototype[stateSymbol];
    }
  }
}
