import assert from "node:assert/strict";
import test from "node:test";
import { buildTokenActivity, activityDateKey } from "../../packages/ui/src/lib/usage-activity.ts";

test("buildTokenActivity summarizes observed token days and streaks", () => {
  const summary = buildTokenActivity(
    [
      { bucket: "2026-06-02", totalTokens: 10 },
      { bucket: "2026-06-03", totalTokens: 30 },
      { bucket: "2026-06-04", totalTokens: 60 },
      { bucket: "2026-06-05", totalTokens: -20 },
      { bucket: "not-a-date", totalTokens: 999 }
    ],
    { minWeeks: 2 }
  );

  assert.equal(summary.totalTokens, 100);
  assert.equal(summary.activeDays, 3);
  assert.equal(summary.dayCount, 4);
  assert.equal(summary.longestStreak, 3);
  assert.equal(summary.maxTokens, 60);
  assert.equal(summary.weekCount, 2);
  assert.equal(summary.cells.length, 14);

  const cellsByDate = new Map(summary.cells.map((cell) => [cell.dateKey, cell]));
  assert.equal(cellsByDate.get("2026-06-02")?.intensity, 1);
  assert.equal(cellsByDate.get("2026-06-03")?.intensity, 3);
  assert.equal(cellsByDate.get("2026-06-04")?.intensity, 4);
  assert.equal(cellsByDate.get("2026-06-05")?.intensity, 0);
});

test("activityDateKey formats local calendar dates", () => {
  assert.equal(activityDateKey(new Date(2026, 0, 5, 14, 30)), "2026-01-05");
});
