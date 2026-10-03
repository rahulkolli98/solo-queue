import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  META_DAILY_LIMITS,
  SECTION_KEYS,
  applyPatch,
  pillarShareTotal,
} from "../../convex/lib/settingsModel";

const ok = (patch: unknown) => {
  const r = applyPatch(DEFAULT_SETTINGS, patch);
  if (!r.ok) throw new Error(`${r.section}: ${r.message}`);
  return r.settings;
};
const refused = (patch: unknown) => {
  const r = applyPatch(DEFAULT_SETTINGS, patch);
  if (r.ok) throw new Error("expected a refusal");
  return r;
};

describe("DEFAULT_SETTINGS", () => {
  it("matches the Settings boards: slots, caps and four pillars", () => {
    expect(DEFAULT_SETTINGS.slotDefaults.threads).toEqual(["09:30", "13:00", "19:00"]);
    expect(DEFAULT_SETTINGS.slotDefaults.instagram).toEqual(["12:00", "18:30"]);
    expect(DEFAULT_SETTINGS.slotDays.instagram).toEqual([0, 2, 4, 5, 6]);
    expect(DEFAULT_SETTINGS.rules.dailyCap.threads).toBeLessThanOrEqual(META_DAILY_LIMITS.threads);
    expect(DEFAULT_SETTINGS.pillars.map((p) => p.key)).toEqual(["build", "tools", "screen", "craft"]);
    expect(pillarShareTotal(DEFAULT_SETTINGS.pillars)).toBe(100);
  });

  it("has a validator for every top-level section except none missing", () => {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(SECTION_KEYS).toContain(key);
    }
  });

  it("every default section passes its own validator unchanged", () => {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      const value = DEFAULT_SETTINGS[key];
      expect(applyPatch(DEFAULT_SETTINGS, { [key]: value }).ok, key).toBe(true);
    }
  });
});

describe("applyPatch", () => {
  it("replaces only the sections in the patch", () => {
    const next = ok({ naturalTiming: false });
    expect(next.naturalTiming).toBe(false);
    expect(next.rules).toEqual(DEFAULT_SETTINGS.rules);
  });

  it("sorts and de-duplicates slot times and days", () => {
    const next = ok({
      slotDefaults: { threads: ["19:00", "09:30", "09:30"], instagram: [] },
      slotDays: { threads: [6, 0, 0, 3], instagram: [1] },
    });
    expect(next.slotDefaults.threads).toEqual(["09:30", "19:00"]);
    expect(next.slotDays.threads).toEqual([0, 3, 6]);
  });

  it("refuses malformed times, days and unknown sections, naming the section", () => {
    expect(refused({ slotDefaults: { threads: ["25:00"], instagram: [] } }).section).toBe("slotDefaults");
    expect(refused({ slotDays: { threads: [7], instagram: [] } }).section).toBe("slotDays");
    expect(refused({ nope: 1 }).message).toMatch(/Unknown settings section/);
    expect(refused("not an object").section).toBe("patch");
    expect(refused([1]).section).toBe("patch");
  });

  it("keeps the daily caps within Meta's limits", () => {
    const rules = { ...DEFAULT_SETTINGS.rules };
    expect(refused({ rules: { ...rules, dailyCap: { threads: 251, instagram: 3 } } }).section).toBe("rules");
    expect(refused({ rules: { ...rules, dailyCap: { threads: 5, instagram: 101 } } }).section).toBe("rules");
    expect(refused({ rules: { ...rules, dailyCap: { threads: 0, instagram: 3 } } }).section).toBe("rules");
    expect(ok({ rules: { ...rules, dailyCap: { threads: 250, instagram: 100 } } }).rules.dailyCap).toEqual({
      threads: 250,
      instagram: 100,
    });
  });

  it("validates the time zone but allows auto", () => {
    expect(ok({ timezone: "Asia/Kolkata" }).timezone).toBe("Asia/Kolkata");
    expect(ok({ timezone: "auto" }).timezone).toBe("auto");
    expect(refused({ timezone: "Mars/Olympus" }).section).toBe("timezone");
  });

  it("sets and clears vacation mode, and refuses a reversed range", () => {
    const set = ok({ vacation: { from: 1000, to: 2000 } });
    expect(set.vacation).toEqual({ from: 1000, to: 2000 });
    const cleared = applyPatch(set, { vacation: null });
    expect(cleared.ok && "vacation" in cleared.settings).toBe(false);
    expect(refused({ vacation: { from: 2000, to: 1000 } }).section).toBe("vacation");
  });

  it("lower-cases and de-duplicates banned words", () => {
    const voice = { ...DEFAULT_SETTINGS.voice, bannedWords: ["Crush It", "crush it", " Unlock "] };
    expect(ok({ voice }).voice.bannedWords).toEqual(["crush it", "unlock"]);
  });

  it("requires unique pillar keys and a pillar color token", () => {
    const [a, b] = DEFAULT_SETTINGS.pillars;
    expect(refused({ pillars: [a, { ...b, key: a.key }] }).section).toBe("pillars");
    expect(refused({ pillars: [{ ...a, color: "#ff0000" }] }).section).toBe("pillars");
    expect(refused({ pillars: [] }).section).toBe("pillars");
  });

  it("checks quiet hours format", () => {
    const n = DEFAULT_SETTINGS.notifications;
    expect(ok({ notifications: { ...n, quietHours: "22:00-07:00" } }).notifications.quietHours).toBe("22:00-07:00");
    expect(refused({ notifications: { ...n, quietHours: "10pm-7am" } }).section).toBe("notifications");
  });
});
