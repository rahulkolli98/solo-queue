import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, META_DAILY_LIMITS, applyPatch } from "../../convex/lib/settingsModel";
import {
  COMMON_TIMEZONES,
  KEEP_ONE_TIME_MESSAGE,
  WEEK,
  addSlotTime,
  clampDailyCap,
  dailyCapClampNote,
  dateInputValue,
  defaultVacation,
  effectiveTz,
  evergreenLabel,
  evergreenOptions,
  mergeDailyCap,
  mergeRules,
  mergeSlotDays,
  mergeSlotDefaults,
  normaliseTime,
  perDayText,
  removeSlotTime,
  timezoneOptions,
  toggleDay,
  vacationFromDates,
  vacationState,
  vacationText,
  vacationToDates,
} from "./slotSettingsEdit";

describe("slot times", () => {
  it("normalises 24-hour times and rejects the rest", () => {
    expect(normaliseTime("9:30")).toBe("09:30");
    expect(normaliseTime("19:05")).toBe("19:05");
    expect(normaliseTime("19:05:00")).toBe("19:05");
    expect(normaliseTime("24:00")).toBeNull();
    expect(normaliseTime("7pm")).toBeNull();
    expect(normaliseTime("")).toBeNull();
  });

  it("adds a time in sorted order", () => {
    const r = addSlotTime(["09:30", "19:00"], "13:00");
    expect(r).toEqual({ ok: true, value: ["09:30", "13:00", "19:00"] });
  });

  it("refuses an empty, invalid or duplicate time, and a ninth time", () => {
    expect(addSlotTime(["09:30"], "")).toMatchObject({ ok: false });
    expect(addSlotTime(["09:30"], "nope")).toMatchObject({ ok: false });
    const dup = addSlotTime(["09:30"], "09:30");
    expect(dup).toEqual({ ok: false, message: "09:30 is already in the list." });
    const full = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"];
    expect(addSlotTime(full, "14:00")).toMatchObject({ ok: false });
  });

  it("removes a time but never the last one", () => {
    expect(removeSlotTime(["09:30", "13:00"], "09:30")).toEqual({ ok: true, value: ["13:00"] });
    expect(removeSlotTime(["09:30"], "09:30")).toEqual({ ok: false, message: KEEP_ONE_TIME_MESSAGE });
    expect(KEEP_ONE_TIME_MESSAGE).toBe("Keep at least one time, or turn off the days below to pause this platform.");
  });

  it("merges one platform into the complete slotDefaults object", () => {
    const next = mergeSlotDefaults(DEFAULT_SETTINGS.slotDefaults, "instagram", ["08:00"]);
    expect(next.instagram).toEqual(["08:00"]);
    expect(next.threads).toEqual(DEFAULT_SETTINGS.slotDefaults.threads);
    expect(perDayText(next.threads)).toBe("3 / DAY");
  });
});

describe("weekdays (Monday = 0)", () => {
  it("shows the week Monday first with the stored numbers", () => {
    expect(WEEK.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(WEEK[0].label).toBe("Monday");
    expect(WEEK[6].label).toBe("Sunday");
    expect(WEEK.map((d) => d.letter).join("")).toBe("MTWTFSS");
  });

  it("toggles a day on and off, sorted", () => {
    expect(toggleDay([0, 2], 1)).toEqual([0, 1, 2]);
    expect(toggleDay([0, 1, 2], 1)).toEqual([0, 2]);
    expect(toggleDay([], 6)).toEqual([6]);
  });

  it("merges one platform into the complete slotDays object", () => {
    const next = mergeSlotDays(DEFAULT_SETTINGS.slotDays, "threads", [0, 4]);
    expect(next).toEqual({ threads: [0, 4], instagram: DEFAULT_SETTINGS.slotDays.instagram });
  });
});

describe("time zone", () => {
  it("lists Auto first, the common zones, and a saved zone that is not listed", () => {
    const options = timezoneOptions("auto");
    expect(options[0]).toEqual({ value: "auto", label: "Auto (detected from your browser)" });
    expect(options).toHaveLength(COMMON_TIMEZONES.length + 1);
    const extra = timezoneOptions("Asia/Kathmandu");
    expect(extra[extra.length - 1]).toEqual({ value: "Asia/Kathmandu", label: "Asia/Kathmandu" });
    expect(timezoneOptions("Asia/Kolkata")).toHaveLength(COMMON_TIMEZONES.length + 1);
  });

  it("offers about thirty common zones and every one is a real IANA zone", () => {
    expect(COMMON_TIMEZONES.length).toBeGreaterThanOrEqual(30);
    for (const zone of COMMON_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: zone }), zone).not.toThrow();
    }
  });

  it("reads dates in the saved zone when it is real, else the browser's, else UTC", () => {
    expect(effectiveTz("Asia/Kolkata", "Europe/London")).toBe("Asia/Kolkata");
    expect(effectiveTz("auto", "Europe/London")).toBe("Europe/London");
    expect(effectiveTz("Nowhere/Land", "Europe/London")).toBe("Europe/London");
    expect(effectiveTz("auto", "Bad/Zone")).toBe("UTC");
  });
});

describe("vacation", () => {
  it("turns two dates into start-of-day and end-of-day in the zone, and back", () => {
    const r = vacationFromDates("2026-10-12", "2026-10-14", "Asia/Kolkata");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 12 Oct 00:00 IST = 11 Oct 18:30 UTC; 14 Oct 23:59:59.999 IST = 14 Oct 18:29:59.999 UTC.
    expect(r.value.from).toBe(Date.UTC(2026, 9, 11, 18, 30));
    expect(r.value.to).toBe(Date.UTC(2026, 9, 14, 18, 30) - 1);
    expect(vacationToDates(r.value, "Asia/Kolkata")).toEqual({ from: "2026-10-12", to: "2026-10-14" });
  });

  it("allows a one-day pause and refuses an end before the start or a missing date", () => {
    expect(vacationFromDates("2026-10-12", "2026-10-12", "UTC").ok).toBe(true);
    expect(vacationFromDates("2026-10-12", "2026-10-11", "UTC")).toEqual({
      ok: false,
      message: "The end date must be on or after the start date.",
    });
    expect(vacationFromDates("", "2026-10-11", "UTC").ok).toBe(false);
    expect(vacationFromDates("2026-02-31", "2026-03-05", "UTC").ok).toBe(false);
  });

  it("defaults to today through seven days later", () => {
    const now = Date.UTC(2026, 9, 5, 10, 0);
    const v = defaultVacation(now, "UTC");
    expect(dateInputValue(v.from, "UTC")).toBe("2026-10-05");
    expect(dateInputValue(v.to, "UTC")).toBe("2026-10-12");
    expect(v.from).toBe(Date.UTC(2026, 9, 5));
    expect(v.to).toBe(Date.UTC(2026, 9, 13) - 1);
  });

  it("knows off, upcoming and active, and words the pause", () => {
    const v = { from: Date.UTC(2026, 9, 12), to: Date.UTC(2026, 9, 15) - 1 };
    expect(vacationState(undefined, 0)).toBe("off");
    expect(vacationState(v, Date.UTC(2026, 9, 1))).toBe("upcoming");
    expect(vacationState(v, Date.UTC(2026, 9, 13))).toBe("active");
    expect(vacationState(v, Date.UTC(2026, 9, 20))).toBe("off");
    expect(vacationText(v, Date.UTC(2026, 9, 13), "UTC")).toBe("Paused until Wed 14 Oct");
    expect(vacationText(v, Date.UTC(2026, 9, 1), "UTC")).toBe("Starts Mon 12 Oct, paused until Wed 14 Oct");
    expect(vacationText(v, Date.UTC(2026, 9, 20), "UTC")).toBe("");
    expect(vacationText(undefined, 0, "UTC")).toBe("");
  });
});

describe("queue rules", () => {
  it("offers the usual rest periods plus a saved odd value", () => {
    expect(evergreenOptions(30)).toEqual([7, 14, 21, 30, 45, 60, 90]);
    expect(evergreenOptions(10)).toEqual([7, 10, 14, 21, 30, 45, 60, 90]);
    expect(evergreenLabel(30)).toBe("30 days");
    expect(evergreenLabel(1)).toBe("1 day");
  });

  it("clamps a cap to 1 through Meta's limit and rejects non-numbers", () => {
    expect(clampDailyCap("5", "threads")).toBe(5);
    expect(clampDailyCap("0", "threads")).toBe(1);
    expect(clampDailyCap("999", "threads")).toBe(META_DAILY_LIMITS.threads);
    expect(clampDailyCap("999", "instagram")).toBe(META_DAILY_LIMITS.instagram);
    expect(clampDailyCap("2.6", "instagram")).toBe(3);
    expect(clampDailyCap("", "threads")).toBeNull();
    expect(clampDailyCap("abc", "threads")).toBeNull();
  });

  it("explains a cap that was brought back into range", () => {
    expect(dailyCapClampNote("999", 100, "instagram")).toContain("Meta's limit");
    expect(dailyCapClampNote("5", 5, "threads")).toBeNull();
  });

  it("keeps fillGaps and the other caps when one thing changes", () => {
    const rules = { ...DEFAULT_SETTINGS.rules, fillGaps: "auto" as const };
    const flipped = mergeRules(rules, { mixPillars: false });
    expect(flipped.fillGaps).toBe("auto");
    expect(flipped.dailyCap).toEqual(rules.dailyCap);
    const capped = mergeDailyCap(rules, "instagram", 7);
    expect(capped.dailyCap).toEqual({ threads: 5, instagram: 7 });
    expect(capped.fillGaps).toBe("auto");
  });
});

describe("results pass the real settings schemas", () => {
  const apply = (patch: unknown) => applyPatch(DEFAULT_SETTINGS, patch);

  it("slotDefaults and slotDays", () => {
    const times = addSlotTime(DEFAULT_SETTINGS.slotDefaults.threads, "7:15");
    expect(times.ok).toBe(true);
    if (!times.ok) return;
    const r = apply({
      slotDefaults: mergeSlotDefaults(DEFAULT_SETTINGS.slotDefaults, "threads", times.value),
      slotDays: mergeSlotDays(DEFAULT_SETTINGS.slotDays, "instagram", toggleDay(DEFAULT_SETTINGS.slotDays.instagram, 1)),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.slotDefaults.threads[0]).toBe("07:15");
      expect(r.settings.slotDays.instagram).toEqual([0, 1, 2, 4, 5, 6]);
    }
  });

  it("every timezone option", () => {
    for (const o of timezoneOptions("auto")) expect(apply({ timezone: o.value }).ok, o.value).toBe(true);
  });

  it("a vacation window, and null clears it", () => {
    const v = vacationFromDates("2026-10-12", "2026-10-14", "Europe/London");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const on = apply({ vacation: v.value });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    expect(on.settings.vacation).toEqual(v.value);
    const off = applyPatch(on.settings, { vacation: null });
    expect(off.ok).toBe(true);
    if (off.ok) expect("vacation" in off.settings).toBe(false);
    const oneDay = vacationFromDates("2026-10-12", "2026-10-12", "Europe/London");
    expect(oneDay.ok && apply({ vacation: oneDay.value }).ok).toBe(true);
  });

  it("rules with a clamped cap and an odd evergreen value", () => {
    const rules = mergeDailyCap(
      mergeRules(DEFAULT_SETTINGS.rules, { evergreenRestDays: 45, oneReelPerDay: false }),
      "threads",
      clampDailyCap("9999", "threads") as number
    );
    const r = apply({ rules });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.settings.rules.dailyCap.threads).toBe(250);
      expect(r.settings.rules.fillGaps).toBe("ask");
    }
  });
});
