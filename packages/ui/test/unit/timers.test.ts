import assert from "node:assert/strict";
import test from "node:test";
import { createRestartableTimer } from "@ccr/ui/pages/home/shared/timers.ts";

test("restartable timer expires only after the configured delay", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let expirations = 0;
  const timer = createRestartableTimer(() => {
    expirations += 1;
  }, 4000);

  timer.restart();
  t.mock.timers.tick(3999);
  assert.equal(expirations, 0);
  t.mock.timers.tick(1);
  assert.equal(expirations, 1);
});

test("restartable timer resets and can be cancelled", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let expirations = 0;
  const timer = createRestartableTimer(() => {
    expirations += 1;
  }, 4000);

  timer.restart();
  t.mock.timers.tick(3000);
  timer.restart();
  t.mock.timers.tick(3000);
  assert.equal(expirations, 0);
  timer.cancel();
  t.mock.timers.tick(4000);
  assert.equal(expirations, 0);
});
