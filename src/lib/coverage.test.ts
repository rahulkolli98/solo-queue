import { describe, expect, it } from "vitest";
import {
  buildRunway,
  daysUntil,
  isoWeekKey,
  shortDayLabel,
} from "../../convex/lib/coverage";

const TZ = "UTC";
const ALL = [0, 1, 2, 3, 4, 5, 6];
// Friday 2026-10-02 12:00 UTC
const NOW = Date.UTC(2026, 9, 2, 12, 0);

const keys = (...k: string[]) => new Set(k);

describe("buildRunway", () => {
  it("counts consecutive written days up to the first gap", () => {
    const r = buildRunway({
      writtenDays: keys("2026-10-02", "2026-10-03", "2026-10-04"),
      failedDays: keys(),
      postingDays: ALL,
      tz: TZ,
      nowMs: NOW,
      horizon: 21,
    });
    expect(r.daysAhead).toBe(3);
    expect(r.cells.slice(0, 4)).toEqual(["written", "written", "written", "open"]);
    expect(r.emptyDays[0]).toBe("2026-10-05");
    expect(r.cells).toHaveLength(21);
  });

  it("does not let a non-posting day break coverage", () => {
    // Instagram posts Mon/Wed/Fri/Sat/Sun (0,2,4,5,6): Tuesday and Thursday are off.
    const r = buildRunway({
      writtenDays: keys("2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-07"),
      failedDays: keys(),
      postingDays: [0, 2, 4, 5, 6],
      tz: TZ,
      nowMs: NOW,
      horizon: 14,
    });
    // Fri, Sat, Sun, Mon written; Tue off; Wed written; Thu off; Fri 9 open -> gap.
    expect(r.cells.slice(0, 7)).toEqual(["written", "written", "written", "written", "off", "written", "off"]);
    expect(r.daysAhead).toBe(7);
  });

  it("marks failed days and stops coverage there only if nothing else is written", () => {
    const r = buildRunway({
      writtenDays: keys("2026-10-02"),
      failedDays: keys("2026-10-03"),
      postingDays: ALL,
      tz: TZ,
      nowMs: NOW,
      horizon: 5,
    });
    expect(r.cells[1]).toBe("failed");
  });

  it("an empty queue has zero days ahead and every posting day open", () => {
    const r = buildRunway({ writtenDays: keys(), failedDays: keys(), postingDays: ALL, tz: TZ, nowMs: NOW, horizon: 7 });
    expect(r.daysAhead).toBe(0);
    expect(r.cells.every((c) => c === "open")).toBe(true);
    expect(r.emptyDays).toHaveLength(7);
  });

  it("uses the local day, not the UTC day", () => {
    // 20:30 UTC on Oct 1 is already Oct 2 in Kolkata.
    const r = buildRunway({
      writtenDays: keys("2026-10-02"),
      failedDays: keys(),
      postingDays: ALL,
      tz: "Asia/Kolkata",
      nowMs: Date.UTC(2026, 9, 1, 20, 30),
      horizon: 3,
    });
    expect(r.cells[0]).toBe("written");
  });
});

describe("isoWeekKey", () => {
  it("matches ISO 8601 weeks, including year boundaries", () => {
    expect(isoWeekKey(Date.UTC(2026, 9, 2), TZ)).toBe("2026-W40");
    expect(isoWeekKey(Date.UTC(2026, 0, 1), TZ)).toBe("2026-W01");
    expect(isoWeekKey(Date.UTC(2021, 0, 3), TZ)).toBe("2020-W53"); // Sunday belongs to the old year's last week
    expect(isoWeekKey(Date.UTC(2024, 11, 30), TZ)).toBe("2025-W01"); // Monday after Christmas week
  });
});

describe("labels", () => {
  it("formats short day labels and days until", () => {
    expect(shortDayLabel("2026-09-28")).toBe("Mon 28");
    expect(daysUntil(NOW + 5.2 * 86400000, NOW)).toBe(6);
    expect(daysUntil(NOW - 1000, NOW)).toBe(0);
  });
});
