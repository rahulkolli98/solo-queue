import { describe, expect, it } from "vitest";
import {
  agoLabel,
  heartbeatView,
  nextStep,
  receiptTime,
  usagePercent,
} from "./publishLog";

describe("agoLabel", () => {
  it("scales from seconds to days", () => {
    expect(agoLabel(0.2)).toBe("1s ago");
    expect(agoLabel(42)).toBe("42s ago");
    expect(agoLabel(300)).toBe("5 min ago");
    expect(agoLabel(3 * 3600)).toBe("3 h ago");
    expect(agoLabel(3 * 86400)).toBe("3 d ago");
  });
  it("never shows a negative or non-finite age", () => {
    expect(agoLabel(-5)).toBe("just now");
    expect(agoLabel(Number.NaN)).toBe("just now");
  });
});

describe("heartbeatView", () => {
  it("waits before the first beat", () => {
    expect(heartbeatView(null, "live")).toMatchObject({ kind: "never", tag: "● Waiting" });
  });
  it("is running when live and fresh, a dry run when not live, stopped when stale", () => {
    expect(heartbeatView({ ageSeconds: 42, stale: false }, "live")).toEqual({ kind: "running", label: "42s ago", tag: "● Running" });
    expect(heartbeatView({ ageSeconds: 42, stale: false }, "dry-run")).toMatchObject({ kind: "dry-run", tag: "● Dry run" });
    expect(heartbeatView({ ageSeconds: 900, stale: true }, "live")).toMatchObject({ kind: "stale", tag: "● Stopped" });
    expect(heartbeatView({ ageSeconds: 900, stale: true }, "dry-run").kind).toBe("stale");
  });
});

describe("usagePercent", () => {
  it("shows a sliver for tiny use, caps at 100 and handles zero", () => {
    expect(usagePercent(0, 250)).toBe(0);
    expect(usagePercent(1, 250)).toBe(2);
    expect(usagePercent(125, 250)).toBe(50);
    expect(usagePercent(900, 250)).toBe(100);
    expect(usagePercent(5, 0)).toBe(0);
  });
});

describe("receiptTime", () => {
  const tz = "Asia/Kolkata";
  const now = Date.UTC(2026, 9, 2, 8, 0); // Fri 13:30 Kolkata
  it("shows only the time for today and the weekday for other days", () => {
    expect(receiptTime(Date.UTC(2026, 9, 2, 6, 35), now, tz)).toBe("12:05");
    expect(receiptTime(Date.UTC(2026, 9, 1, 13, 30), now, tz)).toBe("Thu 19:00");
  });
});

describe("nextStep", () => {
  it("has no next step for a success or an empty message", () => {
    expect(nextStep("success", "Published")).toBeNull();
    expect(nextStep("permanent", null)).toBeNull();
  });
  it("maps common provider failures to a plain action", () => {
    expect(nextStep("permanent", "Image 2: media URL not reachable")).toMatch(/Replace the media/);
    expect(nextStep("retryable", "Threads auth rejected container")).toMatch(/Reconnect/);
    expect(nextStep("retryable", "HTTP 429 too many requests")).toMatch(/daily limit/);
    expect(nextStep("permanent", "The publisher stopped while posting this.")).toMatch(/Look at the account/);
  });
  it("falls back for an unknown permanent failure only", () => {
    expect(nextStep("permanent", "weird")).toMatch(/Open the post in the Queue/);
    expect(nextStep("retryable", "weird")).toBeNull();
  });
});
