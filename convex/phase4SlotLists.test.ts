/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { zonedParts } from "./lib/zoned";
import { insertDraft, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

/**
 * TASK-040 (OQ-004, default slot times): the founder's lists drive "queue this week",
 * and a time chosen for one post overrides the list for that post only.
 *
 * Asserts times, counts, codes and database state only, never message wording.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// A fixed Monday, 06:00 UTC: every list time used below is still ahead on day 0.
const DAY0 = Date.UTC(2026, 5, 1);
const T0 = DAY0 + 6 * HOUR;
/** A UTC instant: `d` days after the pinned day's midnight, at h:m. */
const at = (d: number, h: number, m = 0) => DAY0 + d * DAY + h * HOUR + m * MIN;
const hhmm = (ts: number) => {
  const p = zonedParts(ts, "UTC");
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** UTC planning, every day open, no pillar mixing (it would move slots for reasons unrelated to the lists). */
async function configure(
  t: TestConvex,
  lists: { threads: string[]; instagram: string[] },
  rules: Partial<typeof DEFAULT_SETTINGS.rules> = {}
) {
  return await t.mutation(api.settings.update, {
    patch: {
      timezone: "UTC",
      slotDefaults: lists,
      slotDays: { threads: ALL_DAYS, instagram: ALL_DAYS },
      rules: { ...DEFAULT_SETTINGS.rules, mixPillars: false, ...rules },
    },
  });
}

async function verifiedAsset(t: TestConvex) {
  return await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: "external:https://files.example.test/p.png",
      publicUrl: "https://files.example.test/p.png",
      mimeType: "image/png",
      source: "external",
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    })
  );
}

/** A topic with a Threads draft, and an Instagram caption draft (with verified media) when `ig` is true. */
async function topicWithDrafts(t: TestConvex, title: string, ig = true) {
  const topic = await insertTopic(t, title);
  const threads = await insertDraft(t, topic, "threads", `Post for ${title}`, "threads-hook-story");
  let caption: Id<"drafts"> | undefined;
  if (ig) {
    caption = await insertDraft(t, topic, "instagram", `Caption for ${title}`, "ig-caption-beats");
    const asset = await verifiedAsset(t);
    await t.run(async (ctx) => ctx.db.patch(caption!, { mediaAssetId: asset }));
  }
  return { topic, threads, caption };
}

const timesOf = (res: { queued: { format: string; scheduledAt: number }[] }, format: string) =>
  res.queued.filter((q) => q.format === format).map((q) => q.scheduledAt);

async function scheduledTimes(t: TestConvex, platform: "threads" | "instagram") {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) => q.eq("platform", platform).eq("status", "scheduled"))
      .collect()
  );
  return rows.map((r) => r.scheduledAt).sort((a, b) => a - b);
}

describe("queue this week uses the lists the founder set", () => {
  it("assigns exactly the saved Threads and Instagram times, never the defaults", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["10:15", "16:45"] });

    const results = [];
    for (let i = 1; i <= 4; i++) {
      const { topic } = await topicWithDrafts(t, `Topic ${i}`);
      results.push(await t.mutation(api.slots.queueTopic, { topicId: topic }));
    }

    const threads = results.flatMap((r) => timesOf(r, "Threads"));
    const instagram = results.flatMap((r) => timesOf(r, "IG caption"));
    expect(threads).toEqual([at(0, 8), at(0, 20), at(1, 8), at(1, 20)]);
    expect(instagram).toEqual([at(0, 10, 15), at(0, 16, 45), at(1, 10, 15), at(1, 16, 45)]);
    // Only the reel format has no draft; nothing else was skipped.
    for (const r of results) expect(r.skipped.map((s) => s.code)).toEqual(["NO_DRAFT"]);

    // None of the shipped defaults leaked in.
    const defaults = new Set([...DEFAULT_SETTINGS.slotDefaults.threads, ...DEFAULT_SETTINGS.slotDefaults.instagram]);
    for (const ts of [...threads, ...instagram]) expect(defaults.has(hhmm(ts))).toBe(false);
  });

  it("falls back to DEFAULT_SETTINGS only while the founder has saved nothing", async () => {
    const t = newTest();
    const { topic } = await topicWithDrafts(t, "Fresh install");
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic });
    // No saved settings: the zone is "auto" (UTC without a browser zone) and the first default time of each list is used.
    const firstThreads = [...DEFAULT_SETTINGS.slotDefaults.threads].sort()[0];
    const firstInstagram = [...DEFAULT_SETTINGS.slotDefaults.instagram].sort()[0];
    expect(timesOf(out, "Threads").map(hhmm)).toEqual([firstThreads]);
    expect(timesOf(out, "IG caption").map(hhmm)).toEqual([firstInstagram]);
  });

  it("the NEXT queueTopic after settings.update uses the new lists; what is already queued does not move", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["10:15", "16:45"] });
    const before = [];
    for (let i = 1; i <= 2; i++) {
      const { topic } = await topicWithDrafts(t, `Early ${i}`);
      before.push(await t.mutation(api.slots.queueTopic, { topicId: topic }));
    }
    const threadsBefore = await scheduledTimes(t, "threads");
    const instagramBefore = await scheduledTimes(t, "instagram");
    expect(threadsBefore).toEqual([at(0, 8), at(0, 20)]);
    expect(instagramBefore).toEqual([at(0, 10, 15), at(0, 16, 45)]);

    const saved = await configure(t, { threads: ["16:00", "07:15", "11:45"], instagram: ["09:00"] });
    // Saved sorted: the lists are the founder's, normalised.
    expect(saved.slotDefaults).toEqual({ threads: ["07:15", "11:45", "16:00"], instagram: ["09:00"] });
    // Saving changed nothing that was already queued.
    expect(await scheduledTimes(t, "threads")).toEqual(threadsBefore);
    expect(await scheduledTimes(t, "instagram")).toEqual(instagramBefore);

    const after = [];
    for (let i = 1; i <= 4; i++) {
      const { topic } = await topicWithDrafts(t, `Late ${i}`);
      after.push(await t.mutation(api.slots.queueTopic, { topicId: topic }));
    }
    // Threads: the three new times on day 0 (that day's cap of 5 is then full), then the next day's first.
    expect(after.flatMap((r) => timesOf(r, "Threads"))).toEqual([at(0, 7, 15), at(0, 11, 45), at(0, 16), at(1, 7, 15)]);
    // Instagram: one new time a day; day 0 already holds 2 of its cap of 3.
    expect(after.flatMap((r) => timesOf(r, "IG caption"))).toEqual([at(0, 9), at(1, 9), at(2, 9), at(3, 9)]);
    // The old queue is still exactly where it was.
    const threadsNow = await scheduledTimes(t, "threads");
    for (const ts of threadsBefore) expect(threadsNow).toContain(ts);
    const instagramNow = await scheduledTimes(t, "instagram");
    for (const ts of instagramBefore) expect(instagramNow).toContain(ts);
  });

  it("settings.update keeps the lists sorted and de-duplicated, and refuses a malformed time", async () => {
    const t = newTest();
    const saved = await configure(t, { threads: ["20:00", "08:00", "08:00"], instagram: ["12:30"] });
    expect(saved.slotDefaults.threads).toEqual(["08:00", "20:00"]);
    expect((await t.query(api.settings.get, {})).slotDefaults).toEqual({ threads: ["08:00", "20:00"], instagram: ["12:30"] });

    await expect(
      t.mutation(api.settings.update, { patch: { slotDefaults: { threads: ["8am"], instagram: ["12:30"] } } })
    ).rejects.toThrow(/VALIDATION:INVALID_SETTINGS:/);
    // The refused save did not change the lists.
    expect((await t.query(api.settings.get, {})).slotDefaults.threads).toEqual(["08:00", "20:00"]);
  });
});

describe("a time chosen for one post overrides the list for that post only", () => {
  it("honours an explicit scheduledAt that is not in the list, leaves the list alone, and the next auto placement still follows the list", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["10:15"] });
    const topic = await insertTopic(t, "Custom time");
    const draft = await insertDraft(t, topic, "threads", "A post at an odd time", "threads-hook-story");
    const odd = at(0, 10, 7);

    const queued = await t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: odd });
    expect(queued.scheduledAt).toBe(odd);
    const row = await t.run(async (ctx) => ctx.db.get(queued.slotId));
    expect(row).toMatchObject({ scheduledAt: odd, status: "scheduled", platform: "threads" });
    expect(["08:00", "20:00"]).not.toContain(hhmm(odd));

    // The founder's list is not edited by an override.
    expect((await t.query(api.settings.get, {})).slotDefaults.threads).toEqual(["08:00", "20:00"]);

    // Moving a scheduled post to another off-list time is honoured too.
    const moved = at(0, 14, 42);
    await t.mutation(api.slots.reschedule, { id: queued.slotId, scheduledAt: moved });
    expect((await t.run(async (ctx) => ctx.db.get(queued.slotId)))?.scheduledAt).toBe(moved);

    // The next one-gesture queue goes back to the list.
    const { topic: next } = await topicWithDrafts(t, "Next one", false);
    const out = await t.mutation(api.slots.queueTopic, { topicId: next });
    expect(timesOf(out, "Threads")).toEqual([at(0, 8)]);
  });

  it("still validates an override: a time in the past is refused with BAD_TIME and queues nothing", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["10:15"] });
    const topic = await insertTopic(t, "Past");
    const draft = await insertDraft(t, topic, "threads", "Too late", "threads-hook-story");
    await expect(t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: T0 - MIN })).rejects.toThrow(/VALIDATION:BAD_TIME:/);
    expect(await scheduledTimes(t, "threads")).toEqual([]);
  });
});

describe("no two posts share a slot on a platform", () => {
  it("auto placement skips a time an override already took, and every platform's scheduled times are unique", async () => {
    const t = newTest();
    // The same wall times on both platforms: the uniqueness rule is per platform, not global.
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["08:00", "20:00"] });

    const manual = await insertDraft(t, await insertTopic(t, "Manual"), "threads", "Manual post", "threads-hook-story");
    const manualAt = await t.mutation(api.slots.enqueue, { draftId: manual, scheduledAt: at(0, 8) });
    expect(manualAt.scheduledAt).toBe(at(0, 8));

    const placed: { threads: number[]; instagram: number[] } = { threads: [manualAt.scheduledAt], instagram: [] };
    for (let i = 1; i <= 8; i++) {
      const { topic } = await topicWithDrafts(t, `Fill ${i}`);
      const out = await t.mutation(api.slots.queueTopic, { topicId: topic });
      placed.threads.push(...timesOf(out, "Threads"));
      placed.instagram.push(...timesOf(out, "IG caption"));
    }
    // The first automatic Threads post took the NEXT list time (the manual one holds 08:00).
    expect(placed.threads[1]).toBe(at(0, 20));
    expect(placed.threads).toHaveLength(9);
    expect(new Set(placed.threads).size).toBe(placed.threads.length);
    expect(placed.instagram).toHaveLength(8);
    expect(new Set(placed.instagram).size).toBe(placed.instagram.length);

    // What the database holds agrees: unique per platform, while both platforms use the same instant.
    const th = await scheduledTimes(t, "threads");
    const ig = await scheduledTimes(t, "instagram");
    expect(new Set(th).size).toBe(th.length);
    expect(new Set(ig).size).toBe(ig.length);
    expect(th).toContain(at(0, 8));
    expect(ig).toContain(at(0, 8));
  });
});

describe("a time another post already holds is refused (found by the proof tests, fixed in TASK-040)", () => {
  it("enqueue at a time the platform already holds is refused with SLOT_TAKEN and queues nothing", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["08:00", "20:00"] });
    const first = await insertDraft(t, await insertTopic(t, "A"), "threads", "A", "threads-hook-story");
    const second = await insertDraft(t, await insertTopic(t, "B"), "threads", "B", "threads-hook-story");
    await t.mutation(api.slots.enqueue, { draftId: first, scheduledAt: at(0, 9, 15) });
    await expect(t.mutation(api.slots.enqueue, { draftId: second, scheduledAt: at(0, 9, 15) })).rejects.toThrow(
      /SLOT_TAKEN/
    );
    expect(await scheduledTimes(t, "threads")).toEqual([at(0, 9, 15)]);
    // A minute later is a different slot.
    await t.mutation(api.slots.enqueue, { draftId: second, scheduledAt: at(0, 9, 16) });
    expect(await scheduledTimes(t, "threads")).toEqual([at(0, 9, 15), at(0, 9, 16)]);
  });

  it("the same instant on the OTHER platform is fine", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00"], instagram: ["08:00"] });
    const { threads, caption } = await topicWithDrafts(t, "Both");
    await t.mutation(api.slots.enqueue, { draftId: threads, scheduledAt: at(0, 9, 15) });
    await t.mutation(api.slots.enqueue, { draftId: caption!, scheduledAt: at(0, 9, 15) });
    expect(await scheduledTimes(t, "threads")).toEqual([at(0, 9, 15)]);
    expect(await scheduledTimes(t, "instagram")).toEqual([at(0, 9, 15)]);
  });

  it("reschedule onto another post's time is refused, but moving to its own time or a free time works", async () => {
    const t = newTest();
    await configure(t, { threads: ["08:00", "20:00"], instagram: ["08:00"] });
    const a = await insertDraft(t, await insertTopic(t, "A"), "threads", "A", "threads-hook-story");
    const b = await insertDraft(t, await insertTopic(t, "B"), "threads", "B", "threads-hook-story");
    const slotA = await t.mutation(api.slots.enqueue, { draftId: a, scheduledAt: at(0, 9) });
    const slotB = await t.mutation(api.slots.enqueue, { draftId: b, scheduledAt: at(0, 10) });
    await expect(t.mutation(api.slots.reschedule, { id: slotB.slotId, scheduledAt: at(0, 9) })).rejects.toThrow(
      /SLOT_TAKEN/
    );
    // Its own time is free to it, and so is any unheld time.
    await t.mutation(api.slots.reschedule, { id: slotB.slotId, scheduledAt: at(0, 10) });
    await t.mutation(api.slots.reschedule, { id: slotB.slotId, scheduledAt: at(0, 11) });
    expect(await scheduledTimes(t, "threads")).toEqual([at(0, 9), at(0, 11)]);
    expect(slotA.scheduledAt).toBe(at(0, 9));
  });
});

describe("no default times are hard-coded outside DEFAULT_SETTINGS", () => {
  // The five shipped defaults, spelled out, plus whatever DEFAULT_SETTINGS holds now.
  const FORBIDDEN = [
    ...new Set(["09:30", "13:00", "19:00", "12:00", "18:30", ...DEFAULT_SETTINGS.slotDefaults.threads, ...DEFAULT_SETTINGS.slotDefaults.instagram]),
  ];
  // Production code that may contain one of them as a quoted literal. Everything else must read the
  // saved settings. Test files (*.test.ts, *.test.tsx) are not scanned: they pin their own fixtures.
  // There is no seed or dev file in the list because none of them contains one today; a new one has to be added here on purpose.
  const ALLOWED = ["convex/lib/settingsModel.ts"];

  const sources = import.meta.glob(
    [
      "./**/*.ts",
      "../src/**/*.{ts,tsx}",
      "!./_generated/**",
      "!./**/*.test.ts",
      "!../src/**/*.test.{ts,tsx}",
    ],
    { query: "?raw", import: "default", eager: true }
  ) as Record<string, string>;
  const repoPath = (key: string) => key.replace(/^\.\.\//, "").replace(/^\.\//, "convex/");

  /** Source without comments, so a time written in a doc comment does not count as a hard-coded value. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  }
  const literal = new RegExp(`["'\`](${FORBIDDEN.join("|")})["'\`]`, "g");
  const findLiterals = (text: string) => [...stripComments(text).matchAll(literal)].map((m) => m[1]);

  it("scans the real tree (the scanner would catch a hard-coded time)", () => {
    const paths = Object.keys(sources).map(repoPath);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain("convex/slots.ts");
    expect(paths).toContain("convex/lib/settingsModel.ts");
    expect(paths.some((p) => p.startsWith("src/"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".test.ts"))).toBe(false);
    // Positive and negative controls for the matcher itself.
    expect(findLiterals('const times = ["09:30", "13:00"];')).toEqual(["09:30", "13:00"]);
    expect(findLiterals("const t = '18:30';")).toEqual(["18:30"]);
    expect(findLiterals('// the "09:30" slot\nconst a = 1; /* "13:00" */')).toEqual([]);
    expect(findLiterals("Use 24-hour HH:MM, like 19:00.")).toEqual([]);
  });

  it("the shipped times appear as code literals only in the allowed files", () => {
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(sources)) {
      const path = repoPath(key);
      if (ALLOWED.includes(path)) continue;
      const found = findLiterals(text);
      if (found.length > 0) offenders.push(`${path}: ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("inside settingsModel.ts they sit only in the DEFAULT_SETTINGS object", () => {
    const entry = Object.entries(sources).find(([key]) => repoPath(key) === "convex/lib/settingsModel.ts");
    const text = stripComments(entry![1]);
    const start = text.indexOf("DEFAULT_SETTINGS: AppSettings = {");
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let i = text.indexOf("{", start); i < text.length; i++) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    expect(end).toBeGreaterThan(start);
    const outside = text.slice(0, start) + text.slice(end + 1);
    expect(findLiterals(outside)).toEqual([]);
    expect(findLiterals(text.slice(start, end + 1)).length).toBeGreaterThan(0);
  });
});
