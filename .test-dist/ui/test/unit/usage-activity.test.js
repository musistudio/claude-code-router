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

// packages/ui/test/unit/usage-activity.test.mjs
var import_strict = __toESM(require("node:assert/strict"), 1);
var import_node_test = __toESM(require("node:test"), 1);

// packages/ui/src/lib/usage-activity.ts
var dayMs = 24 * 60 * 60 * 1e3;
function buildTokenActivity(series, options = {}) {
  const totalsByDay = /* @__PURE__ */ new Map();
  let observedStart;
  let observedEnd;
  for (const point of series) {
    const date = startOfLocalDay(new Date(point.bucket));
    if (!isFiniteDate(date)) {
      continue;
    }
    const key = activityDateKey(date);
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + Math.max(0, point.totalTokens));
    observedStart = observedStart && observedStart <= date ? observedStart : date;
    observedEnd = observedEnd && observedEnd >= date ? observedEnd : date;
  }
  const today = startOfLocalDay(/* @__PURE__ */ new Date());
  observedStart = observedStart ?? today;
  observedEnd = observedEnd ?? today;
  let gridStart = startOfActivityWeek(observedStart);
  const gridEnd = endOfActivityWeek(observedEnd);
  let weekCount = weeksBetween(gridStart, gridEnd);
  const minWeeks = positiveInteger(options.minWeeks);
  const maxWeeks = positiveInteger(options.maxWeeks);
  if (minWeeks && weekCount < minWeeks) {
    gridStart = addDays(gridStart, -(minWeeks - weekCount) * 7);
    weekCount = minWeeks;
  }
  if (maxWeeks && weekCount > maxWeeks) {
    gridStart = addDays(gridEnd, -(maxWeeks * 7 - 1));
    gridStart = startOfActivityWeek(gridStart);
    weekCount = maxWeeks;
  }
  const dayCount = Math.max(1, daysBetween(observedStart, observedEnd) + 1);
  const totalTokens = sumObservedTokens(totalsByDay, observedStart, observedEnd);
  const maxTokens = Math.max(...Array.from(totalsByDay.values()), 0);
  const cells = [];
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDays(gridStart, weekIndex * 7 + dayIndex);
      const dateKey = activityDateKey(date);
      const total = totalsByDay.get(dateKey) ?? 0;
      cells.push({
        date,
        dateKey,
        dateLabel: formatActivityDateLabel(date),
        dayIndex,
        inObservedRange: date >= observedStart && date <= observedEnd,
        intensity: tokenActivityIntensity(total, maxTokens),
        totalTokens: total,
        weekIndex
      });
    }
  }
  const activeDays = countObservedDays(totalsByDay, observedStart, observedEnd, (value) => value > 0);
  return {
    activeDays,
    avgPerDay: totalTokens / dayCount,
    avgPerWeek: totalTokens / Math.max(1, dayCount / 7),
    cells,
    dayCount,
    longestStreak: longestObservedStreak(totalsByDay, observedStart, observedEnd),
    maxTokens,
    months: activityMonthLabels(cells),
    totalTokens,
    weekCount
  };
}
function activityDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatActivityDateLabel(date) {
  return new Intl.DateTimeFormat(void 0, { day: "numeric", month: "short" }).format(date);
}
function activityMonthLabels(cells) {
  const labels = [];
  const seen = /* @__PURE__ */ new Set();
  for (const cell of cells) {
    const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push({
      label: new Intl.DateTimeFormat(void 0, { month: "short" }).format(cell.date),
      weekIndex: cell.weekIndex
    });
  }
  return labels;
}
function tokenActivityIntensity(value, maxValue) {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }
  const ratio = value / maxValue;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}
function sumObservedTokens(totalsByDay, start, end) {
  let total = 0;
  walkDays(start, end, (date) => {
    total += totalsByDay.get(activityDateKey(date)) ?? 0;
  });
  return total;
}
function countObservedDays(totalsByDay, start, end, predicate) {
  let count = 0;
  walkDays(start, end, (date) => {
    if (predicate(totalsByDay.get(activityDateKey(date)) ?? 0)) {
      count += 1;
    }
  });
  return count;
}
function longestObservedStreak(totalsByDay, start, end) {
  let current = 0;
  let longest = 0;
  walkDays(start, end, (date) => {
    if ((totalsByDay.get(activityDateKey(date)) ?? 0) > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
}
function walkDays(start, end, visit) {
  for (let date = startOfLocalDay(start); date <= end; date = addDays(date, 1)) {
    visit(date);
  }
}
function startOfLocalDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
function startOfActivityWeek(date) {
  const next = startOfLocalDay(date);
  const mondayOffset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - mondayOffset);
  return next;
}
function endOfActivityWeek(date) {
  return addDays(startOfActivityWeek(date), 6);
}
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfLocalDay(next);
}
function daysBetween(start, end) {
  return Math.max(0, Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / dayMs));
}
function weeksBetween(start, end) {
  return Math.max(1, Math.floor(daysBetween(start, end) / 7) + 1);
}
function isFiniteDate(date) {
  return Number.isFinite(date.getTime());
}
function positiveInteger(value) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return void 0;
  }
  return Math.floor(value);
}

// packages/ui/test/unit/usage-activity.test.mjs
(0, import_node_test.default)("buildTokenActivity summarizes observed token days and streaks", () => {
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
  import_strict.default.equal(summary.totalTokens, 100);
  import_strict.default.equal(summary.activeDays, 3);
  import_strict.default.equal(summary.dayCount, 4);
  import_strict.default.equal(summary.longestStreak, 3);
  import_strict.default.equal(summary.maxTokens, 60);
  import_strict.default.equal(summary.weekCount, 2);
  import_strict.default.equal(summary.cells.length, 14);
  const cellsByDate = new Map(summary.cells.map((cell) => [cell.dateKey, cell]));
  import_strict.default.equal(cellsByDate.get("2026-06-02")?.intensity, 1);
  import_strict.default.equal(cellsByDate.get("2026-06-03")?.intensity, 3);
  import_strict.default.equal(cellsByDate.get("2026-06-04")?.intensity, 4);
  import_strict.default.equal(cellsByDate.get("2026-06-05")?.intensity, 0);
});
(0, import_node_test.default)("activityDateKey formats local calendar dates", () => {
  import_strict.default.equal(activityDateKey(new Date(2026, 0, 5, 14, 30)), "2026-01-05");
});
