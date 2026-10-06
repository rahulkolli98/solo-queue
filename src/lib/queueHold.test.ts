import { describe, expect, it } from "vitest";
import {
  FAILURE_WINDOW_MS,
  MAX_JITTER_MS,
  holdReason,
  isHeldByNaturalTiming,
  isUnresolvedFailure,
  slotJitterMs,
} from "../../convex/lib/queueHold";

const NOW = Date.UTC(2026, 9, 5, 12, 0);
const HOUR = 3600_000;
const rules = (pauseOnFailure: boolean) => ({ pauseOnFailure });

describe("holdReason", () => {
  it("holds for vacation from the first to the last instant of the window, and not outside it", () => {
    const vacation = { from: NOW - HOUR, to: NOW + HOUR };
    const s = { vacation, rules: rules(true) };
    expect(holdReason(s, [], NOW)).toBe("vacation");
    expect(holdReason(s, [], vacation.from)).toBe("vacation");
    expect(holdReason(s, [], vacation.to)).toBe("vacation");
    expect(holdReason(s, [], vacation.from - 1)).toBeNull();
    expect(holdReason(s, [], vacation.to + 1)).toBeNull();
  });

  it("holds for a recent failed post only when pause on failure is on", () => {
    const failed = [{ scheduledAt: NOW - 3 * HOUR }];
    expect(holdReason({ rules: rules(true) }, failed, NOW)).toBe("failure");
    expect(holdReason({ rules: rules(false) }, failed, NOW)).toBeNull();
    expect(holdReason({ rules: rules(true) }, [], NOW)).toBeNull();
  });

  it("ignores a failure older than the window Today uses for its failed alert", () => {
    const old = [{ scheduledAt: NOW - FAILURE_WINDOW_MS - 1 }];
    const edge = [{ scheduledAt: NOW - FAILURE_WINDOW_MS }];
    expect(holdReason({ rules: rules(true) }, old, NOW)).toBeNull();
    expect(holdReason({ rules: rules(true) }, edge, NOW)).toBe("failure");
  });

  it("names the vacation when both apply", () => {
    const s = { vacation: { from: NOW - HOUR, to: NOW + HOUR }, rules: rules(true) };
    expect(holdReason(s, [{ scheduledAt: NOW - HOUR }], NOW)).toBe("vacation");
  });
});

describe("isUnresolvedFailure", () => {
  it("is a failed slot scheduled within the last 14 days", () => {
    expect(isUnresolvedFailure({ status: "failed", scheduledAt: NOW - HOUR }, NOW)).toBe(true);
    expect(isUnresolvedFailure({ status: "scheduled", scheduledAt: NOW - HOUR }, NOW)).toBe(false);
    expect(isUnresolvedFailure({ status: "failed", scheduledAt: NOW - FAILURE_WINDOW_MS - 1 }, NOW)).toBe(false);
  });
});

describe("slotJitterMs", () => {
  it("is deterministic per slot id", () => {
    expect(slotJitterMs("k17abc")).toBe(slotJitterMs("k17abc"));
    expect(slotJitterMs("k17abc")).not.toBe(slotJitterMs("k17abd"));
  });

  it("stays from 0 up to but not including 2 minutes, and spreads across the range", () => {
    const values = Array.from({ length: 2000 }, (_, i) => slotJitterMs(`slot-${i}-xyz`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(MAX_JITTER_MS);
    expect(Math.max(...values)).toBeGreaterThan(MAX_JITTER_MS * 0.9);
    expect(Math.min(...values)).toBeLessThan(MAX_JITTER_MS * 0.1);
    expect(Number.isInteger(values[0])).toBe(true);
  });
});

describe("isHeldByNaturalTiming", () => {
  const slot = { _id: "slot-a", scheduledAt: NOW, attempts: 0 };
  const jitter = slotJitterMs(slot._id);

  it("holds a first attempt until its own delay has passed, never longer than 2 minutes", () => {
    expect(jitter).toBeLessThan(MAX_JITTER_MS);
    expect(isHeldByNaturalTiming(slot, true, NOW + jitter - 1)).toBe(jitter > 0);
    expect(isHeldByNaturalTiming(slot, true, NOW + jitter)).toBe(false);
    expect(isHeldByNaturalTiming(slot, true, NOW + MAX_JITTER_MS)).toBe(false);
  });

  it("never claims early", () => {
    expect(isHeldByNaturalTiming(slot, true, NOW - 1)).toBe(true);
  });

  it("does not delay when natural timing is off", () => {
    expect(isHeldByNaturalTiming(slot, false, NOW)).toBe(false);
  });

  it("does not delay a retry or a slot that was rescheduled", () => {
    expect(isHeldByNaturalTiming({ ...slot, attempts: 1 }, true, NOW)).toBe(false);
    expect(isHeldByNaturalTiming({ ...slot, originalScheduledAt: NOW - HOUR }, true, NOW)).toBe(false);
  });
});
