import { describe, expect, it } from "vitest";
import {
  dayKey,
  nextFreeSlot,
  resolveTz,
  zonedParts,
  zonedWallToUtc,
} from "../../convex/lib/zoned";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("resolveTz", () => {
  it("maps auto, empty and unknown zones to UTC and keeps valid ones", () => {
    expect(resolveTz("auto")).toBe("UTC");
    expect(resolveTz(undefined)).toBe("UTC");
    expect(resolveTz("Mars/Olympus")).toBe("UTC");
    expect(resolveTz("Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});

describe("zonedParts / zonedWallToUtc", () => {
  it("reads wall time and weekday in the zone", () => {
    // 2026-10-02 00:00 UTC is Friday 05:30 in Kolkata.
    const p = zonedParts(Date.UTC(2026, 9, 2, 0, 0), "Asia/Kolkata");
    expect(p).toMatchObject({ year: 2026, month: 10, day: 2, hour: 5, minute: 30, weekday: 4 });
  });

  it("round-trips wall time to UTC for a fixed-offset zone", () => {
    const ts = zonedWallToUtc({ year: 2026, month: 10, day: 2, hour: 9, minute: 30 }, "Asia/Kolkata");
    expect(ts).toBe(Date.UTC(2026, 9, 2, 4, 0));
  });

  it("follows DST: 09:30 New York is 13:30 UTC in summer and 14:30 UTC in winter", () => {
    const summer = zonedWallToUtc({ year: 2026, month: 7, day: 1, hour: 9, minute: 30 }, "America/New_York");
    const winter = zonedWallToUtc({ year: 2026, month: 12, day: 1, hour: 9, minute: 30 }, "America/New_York");
    expect(summer).toBe(Date.UTC(2026, 6, 1, 13, 30));
    expect(winter).toBe(Date.UTC(2026, 11, 1, 14, 30));
  });

  it("dayKey is the local calendar day, not the UTC day", () => {
    const ts = Date.UTC(2026, 9, 1, 20, 0); // 01:30 on Oct 2 in Kolkata
    expect(dayKey(ts, "UTC")).toBe("2026-10-01");
    expect(dayKey(ts, "Asia/Kolkata")).toBe("2026-10-02");
  });
});

describe("nextFreeSlot", () => {
  const tz = "Asia/Kolkata";
  const after = Date.UTC(2026, 9, 2, 5, 0); // Fri 10:30 Kolkata

  it("returns the next time today when one is left", () => {
    const ts = nextFreeSlot({ times: ["09:30", "13:00", "19:00"], days: ALL_DAYS, tz, afterMs: after, taken: [] });
    expect(ts).toBe(zonedWallToUtc({ year: 2026, month: 10, day: 2, hour: 13, minute: 0 }, tz));
  });

  it("rolls to the next allowed weekday", () => {
    // Friday 10:30; only Monday (0) allowed -> Monday 12:00.
    const ts = nextFreeSlot({ times: ["12:00"], days: [0], tz, afterMs: after, taken: [] });
    expect(ts).toBe(zonedWallToUtc({ year: 2026, month: 10, day: 5, hour: 12, minute: 0 }, tz));
  });

  it("skips taken slots and walks forward", () => {
    const first = nextFreeSlot({ times: ["13:00"], days: ALL_DAYS, tz, afterMs: after, taken: [] });
    const second = nextFreeSlot({ times: ["13:00"], days: ALL_DAYS, tz, afterMs: after, taken: [first] });
    expect(second).toBe(first + 24 * 3600 * 1000);
  });

  it("honours the daily cap by moving to a day with room", () => {
    const t13 = zonedWallToUtc({ year: 2026, month: 10, day: 2, hour: 13, minute: 0 }, tz);
    const next = nextFreeSlot({
      times: ["13:00", "19:00"],
      days: ALL_DAYS,
      tz,
      afterMs: after,
      taken: [t13],
      maxPerDay: 1,
    });
    expect(dayKey(next, tz)).toBe("2026-10-03");
  });

  it("skips the vacation window", () => {
    const from = zonedWallToUtc({ year: 2026, month: 10, day: 2, hour: 0, minute: 0 }, tz);
    const to = zonedWallToUtc({ year: 2026, month: 10, day: 4, hour: 23, minute: 59 }, tz);
    const ts = nextFreeSlot({ times: ["13:00"], days: ALL_DAYS, tz, afterMs: after, taken: [], vacation: { from, to } });
    expect(dayKey(ts, tz)).toBe("2026-10-05");
  });

  it("refuses when there are no times or days, or nothing fits", () => {
    expect(() => nextFreeSlot({ times: [], days: ALL_DAYS, tz, afterMs: after, taken: [] })).toThrow(/No slot times/);
    expect(() => nextFreeSlot({ times: ["12:00"], days: [], tz, afterMs: after, taken: [] })).toThrow(/No posting days/);
    expect(() =>
      nextFreeSlot({ times: ["12:00"], days: ALL_DAYS, tz, afterMs: after, taken: [], vacation: { from: 0, to: 9e15 } })
    ).toThrow(/No free slot/);
  });

  it("ignores malformed times", () => {
    const ts = nextFreeSlot({ times: ["nope", "25:00", "13:00"], days: ALL_DAYS, tz, afterMs: after, taken: [] });
    expect(ts).toBe(zonedWallToUtc({ year: 2026, month: 10, day: 2, hour: 13, minute: 0 }, tz));
  });
});
