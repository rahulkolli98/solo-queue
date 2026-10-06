import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, applyPatch } from "../../convex/lib/settingsModel";
import {
  LATER_ROWS,
  LIVE_ROWS,
  mergeNotifications,
  parseQuietHours,
  quietHoursProblem,
  withQuietHours,
  withoutQuietHours,
} from "./notificationsEdit";

const base = DEFAULT_SETTINGS.notifications;
const accepted = (notifications: unknown) => {
  const r = applyPatch(DEFAULT_SETTINGS, { notifications });
  if (!r.ok) throw new Error(r.message);
  return r.settings.notifications;
};

describe("notification rows", () => {
  it("splits the five board events into three that act on Today and two that are not built yet", () => {
    expect(LIVE_ROWS.map((r) => r.key)).toEqual(["tokenExpiring", "postFailed", "queueLow"]);
    expect(LATER_ROWS.map((r) => r.key)).toEqual(["postPublished", "sundayDigest"]);
  });

  it("flips one alert and keeps the rest of the section, so the whole object can be saved", () => {
    const next = mergeNotifications(base, { queueLow: false });
    expect(next).toEqual({ ...base, queueLow: false });
    expect(accepted(next).queueLow).toBe(false);
  });
});

describe("quiet hours", () => {
  it("reads a saved HH:MM-HH:MM and ignores nothing or a malformed value", () => {
    expect(parseQuietHours("22:00-08:00")).toEqual({ from: "22:00", to: "08:00" });
    expect(parseQuietHours(undefined)).toBeNull();
    expect(parseQuietHours("")).toBeNull();
    expect(parseQuietHours("22:00")).toBeNull();
    expect(parseQuietHours("25:00-08:00")).toBeNull();
  });

  it("refuses a missing time or identical times with a plain message", () => {
    expect(quietHoursProblem("", "08:00")).toMatch(/Pick both times/);
    expect(quietHoursProblem("22:00", "22:00")).toMatch(/differ/);
    expect(quietHoursProblem("22:00", "08:00")).toBeNull();
  });

  it("saves and clears quiet hours in a shape the backend accepts", () => {
    const withHours = withQuietHours(base, "22:00", "08:00");
    expect(withHours.quietHours).toBe("22:00-08:00");
    expect(accepted(withHours).quietHours).toBe("22:00-08:00");
    const cleared = withoutQuietHours(withHours);
    expect("quietHours" in cleared).toBe(false);
    expect(accepted(cleared).quietHours).toBeUndefined();
  });
});
