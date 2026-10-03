import { dayKey, zonedParts } from "./zoned";

/**
 * Queue coverage maths for the Today board: how many days ahead each platform
 * is written, the 21-day runway cells, the ISO week key used to dismiss a
 * nudge for a week, and a few labels. Pure and unit-tested.
 */

export type RunwayCell = "written" | "open" | "failed" | "off";

export interface CoverageInput {
  /** Local day keys (YYYY-MM-DD) that hold at least one scheduled or published slot. */
  writtenDays: Set<string>;
  /** Local day keys that hold a failed slot. */
  failedDays: Set<string>;
  /** Allowed posting weekdays for the platform, Mon = 0. */
  postingDays: number[];
  tz: string;
  nowMs: number;
  /** How many days to chart (the runway is 21). */
  horizon: number;
}

export interface Runway {
  cells: RunwayCell[];
  /** Calendar days ahead covered before the first empty posting day. */
  daysAhead: number;
  /** Local day keys of posting days with nothing written, in the next `horizon` days. */
  emptyDays: string[];
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * One cell per day from today: written, open (a posting day with nothing
 * written), failed, or off (not a posting day and nothing written). Days
 * ahead counts calendar days up to the first empty posting day; non-posting
 * days neither break nor extend coverage.
 */
export function buildRunway(input: CoverageInput): Runway {
  const today = dayKey(input.nowMs, input.tz);
  const cells: RunwayCell[] = [];
  const emptyDays: string[] = [];
  let daysAhead = 0;
  let gapFound = false;
  for (let i = 0; i < input.horizon; i++) {
    const key = addDays(today, i);
    const posting = input.postingDays.includes(weekdayOf(key));
    const written = input.writtenDays.has(key);
    const failed = input.failedDays.has(key);
    let cell: RunwayCell;
    if (failed) cell = "failed";
    else if (written) cell = "written";
    else if (posting) cell = "open";
    else cell = "off";
    cells.push(cell);
    if (cell === "open") {
      emptyDays.push(key);
      gapFound = true;
    }
    if (!gapFound) daysAhead = i + 1;
  }
  return { cells, daysAhead, emptyDays };
}

/** ISO 8601 week key like "2026-W40", in the founder's zone. */
export function isoWeekKey(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon 28" for a local day key. */
export function shortDayLabel(key: string): string {
  const day = Number(key.split("-")[2]);
  return `${WEEKDAY_SHORT[weekdayOf(key)]} ${day}`;
}

/** Whole days from `nowMs` until `ts` (rounded up), never negative. */
export function daysUntil(ts: number, nowMs: number): number {
  return Math.max(0, Math.ceil((ts - nowMs) / 86400000));
}
