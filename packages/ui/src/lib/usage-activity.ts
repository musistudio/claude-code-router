import type { UsageSeriesPoint } from "@ccr/core/contracts/app";

export type TokenActivityCell = {
  date: Date;
  dateKey: string;
  dateLabel: string;
  dayIndex: number;
  inObservedRange: boolean;
  intensity: 0 | 1 | 2 | 3 | 4;
  totalTokens: number;
  weekIndex: number;
};

export type TokenActivityMonthLabel = {
  label: string;
  weekIndex: number;
};

export type TokenActivitySummary = {
  activeDays: number;
  avgPerDay: number;
  avgPerWeek: number;
  cells: TokenActivityCell[];
  dayCount: number;
  longestStreak: number;
  maxTokens: number;
  months: TokenActivityMonthLabel[];
  totalTokens: number;
  weekCount: number;
};

type TokenActivityOptions = {
  maxWeeks?: number;
  minWeeks?: number;
};

const dayMs = 24 * 60 * 60 * 1000;

export function buildTokenActivity(series: UsageSeriesPoint[], options: TokenActivityOptions = {}): TokenActivitySummary {
  const totalsByDay = new Map<string, number>();
  let observedStart: Date | undefined;
  let observedEnd: Date | undefined;

  for (const point of series) {
    const date = startOfLocalDay(parseActivityDate(point.bucket));
    if (!isFiniteDate(date)) {
      continue;
    }
    const key = activityDateKey(date);
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + Math.max(0, point.totalTokens));
    observedStart = observedStart && observedStart <= date ? observedStart : date;
    observedEnd = observedEnd && observedEnd >= date ? observedEnd : date;
  }

  const today = startOfLocalDay(new Date());
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
  const cells: TokenActivityCell[] = [];

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

function parseActivityDate(bucket: string): Date {
  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(bucket.trim());
  if (!dateOnly) {
    return new Date(bucket);
  }

  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]);
  const day = Number(dateOnly[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return new Date(Number.NaN);
  }
  return date;
}

export function activityDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatActivityDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function activityMonthLabels(cells: TokenActivityCell[]): TokenActivityMonthLabel[] {
  const labels: TokenActivityMonthLabel[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push({
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(cell.date),
      weekIndex: cell.weekIndex
    });
  }
  return labels;
}

function tokenActivityIntensity(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }
  const ratio = value / maxValue;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

function sumObservedTokens(totalsByDay: Map<string, number>, start: Date, end: Date): number {
  let total = 0;
  walkDays(start, end, (date) => {
    total += totalsByDay.get(activityDateKey(date)) ?? 0;
  });
  return total;
}

function countObservedDays(totalsByDay: Map<string, number>, start: Date, end: Date, predicate: (value: number) => boolean): number {
  let count = 0;
  walkDays(start, end, (date) => {
    if (predicate(totalsByDay.get(activityDateKey(date)) ?? 0)) {
      count += 1;
    }
  });
  return count;
}

function longestObservedStreak(totalsByDay: Map<string, number>, start: Date, end: Date): number {
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

function walkDays(start: Date, end: Date, visit: (date: Date) => void) {
  for (let date = startOfLocalDay(start); date <= end; date = addDays(date, 1)) {
    visit(date);
  }
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfActivityWeek(date: Date): Date {
  const next = startOfLocalDay(date);
  const mondayOffset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - mondayOffset);
  return next;
}

function endOfActivityWeek(date: Date): Date {
  return addDays(startOfActivityWeek(date), 6);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfLocalDay(next);
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / dayMs));
}

function weeksBetween(start: Date, end: Date): number {
  return Math.max(1, Math.floor(daysBetween(start, end) / 7) + 1);
}

function isFiniteDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function positiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}
