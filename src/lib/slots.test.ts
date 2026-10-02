import { describe, expect, it } from "vitest";
import { DAY_MS, forwardCoverage, startOfDay, weekWindow } from "./slots";

describe("startOfDay", () => {
  it("snaps to local midnight", () => {
    const d = startOfDay(new Date(2026, 8, 25, 18, 30, 15));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getDate()).toBe(25);
  });
});

describe("weekWindow", () => {
  it("returns 7 consecutive days starting at local midnight", () => {
    const { start, days } = weekWindow(new Date(2026, 8, 25, 9, 30));
    expect(days).toHaveLength(7);
    expect(start.getTime()).toBe(days[0].getTime());
    expect(start.getHours()).toBe(0);
    for (let i = 1; i < 7; i++) {
      expect(days[i].getTime() - days[i - 1].getTime()).toBe(DAY_MS);
    }
  });
});

describe("forwardCoverage", () => {
  const now = new Date(2026, 8, 25, 12, 0).getTime(); // midday
  const at = (dayOffset: number, hour = 9) =>
    startOfDay(now).getTime() + dayOffset * DAY_MS + hour * 3600 * 1000;

  it("counts consecutive covered days from today", () => {
    const slots = [{ scheduledAt: at(0) }, { scheduledAt: at(1) }, { scheduledAt: at(2) }];
    expect(forwardCoverage(slots, now)).toBe(3);
  });

  it("is zero when today is empty even if later days are full", () => {
    const slots = [{ scheduledAt: at(1) }, { scheduledAt: at(2) }];
    expect(forwardCoverage(slots, now)).toBe(0);
  });

  it("stops at the first gap", () => {
    const slots = [{ scheduledAt: at(0) }, { scheduledAt: at(2) }];
    expect(forwardCoverage(slots, now)).toBe(1);
  });

  it("counts multiple slots on the same day once", () => {
    const slots = [{ scheduledAt: at(0, 9) }, { scheduledAt: at(0, 18) }];
    expect(forwardCoverage(slots, now)).toBe(1);
  });

  it("includes a slot later today", () => {
    const slots = [{ scheduledAt: at(0, 18) }];
    expect(forwardCoverage(slots, now)).toBe(1);
  });

  it("ignores past slots", () => {
    const slots = [{ scheduledAt: at(-2) }, { scheduledAt: at(-1) }];
    expect(forwardCoverage(slots, now)).toBe(0);
  });

  it("reads a full 7-day lane (TASK-023 week-view drill)", () => {
    const slots = Array.from({ length: 7 }, (_, i) => ({ scheduledAt: at(i) }));
    expect(forwardCoverage(slots, now)).toBe(7);
  });
});
