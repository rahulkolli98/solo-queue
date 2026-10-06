import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { slotJitterMs } from "./lib/queueHold";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { dayKey, nextFreeSlot, zonedParts } from "./lib/zoned";
import { insertDraft, insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const MIN = 60_000;
const HOUR = 3600_000;
const DAY = 86400000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const BASE_RULES = DEFAULT_SETTINGS.rules;
const REEL_REFUSAL =
  /ONE_REEL_PER_DAY: There is already a reel on that day\. Pick another day, or turn off "One reel a day" in Settings\./;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function configure(t: TestConvex, patch: Record<string, unknown>) {
  await t.mutation(api.settings.update, { patch });
}

/** UTC planning with known slot times, every day open. */
async function utcSlots(
  t: TestConvex,
  over: { threads?: string[]; instagram?: string[]; rules?: Partial<typeof BASE_RULES> } = {}
) {
  await configure(t, {
    timezone: "UTC",
    slotDefaults: { threads: over.threads ?? ["09:30", "13:00", "19:00"], instagram: over.instagram ?? ["12:00", "18:30"] },
    slotDays: { threads: ALL_DAYS, instagram: ALL_DAYS },
    rules: { ...BASE_RULES, ...over.rules },
  });
}

const day0 = Math.floor(Date.now() / DAY) * DAY;
/** A UTC instant: `d` days after today's midnight, at h:m. */
const at = (d: number, h: number, m = 0) => day0 + d * DAY + h * HOUR + m * MIN;

async function statusOf(t: TestConvex, id: Id<"slots">) {
  return (await t.run(async (ctx) => ctx.db.get(id)))?.status;
}

describe("vacation pauses claims", () => {
  it("claims nothing while now is inside the window, and resumes when it is cleared", async () => {
    const t = newTest();
    const now = Date.now();
    await configure(t, { vacation: { from: now - HOUR, to: now + HOUR } });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, now - 10 * MIN);

    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([]);
    expect(await statusOf(t, slot)).toBe("scheduled");

    await configure(t, { vacation: null });
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([slot]);
  });

  it("claims as usual when now is before or after the window", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    await insertSlot(t, draft, now - 10 * MIN);
    await configure(t, { vacation: { from: now + HOUR, to: now + 2 * HOUR } });
    expect(await t.mutation(internal.slots.claimDue, { now })).toHaveLength(1);
    await configure(t, { vacation: { from: now - 3 * HOUR, to: now - 2 * HOUR } });
    const d2 = await insertDraft(t, topic);
    await insertSlot(t, d2, now - 10 * MIN);
    expect(await t.mutation(internal.slots.claimDue, { now })).toHaveLength(1);
  });
});

describe("saving a vacation keeps the queue's order and resumes after it", () => {
  async function queued(t: TestConvex, platform: "threads" | "instagram", when: number, templateKey = "threads-hook-story") {
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, platform, "Body", templateKey);
    return await insertSlot(t, draft, when, { platform });
  }
  const read = (t: TestConvex, id: Id<"slots">) => t.run(async (ctx) => ctx.db.get(id));

  it("moves three queued posts after the window, in order, on real slot times, none sharing a slot", async () => {
    const t = newTest();
    await utcSlots(t, { threads: ["09:30", "13:00"] });
    const from = at(2, 0);
    const to = at(4, 0);
    const a = await queued(t, "threads", at(2, 9, 30));
    const b = await queued(t, "threads", at(2, 13));
    const c = await queued(t, "threads", at(3, 9, 30));
    const before = await queued(t, "threads", at(1, 13));
    const occupied = await queued(t, "threads", at(4, 9, 30)); // already taken after the window
    const claimed = await queued(t, "threads", at(3, 13));
    await t.run(async (ctx) => ctx.db.patch(claimed, { status: "claimed" }));

    await configure(t, { vacation: { from, to } });

    const [ra, rb, rc] = await Promise.all([read(t, a), read(t, b), read(t, c)]);
    const times = [ra!.scheduledAt, rb!.scheduledAt, rc!.scheduledAt];
    expect(times).toEqual([at(4, 13), at(5, 9, 30), at(5, 13)]);
    for (const ts of times) {
      expect(ts).toBeGreaterThan(to);
      const p = zonedParts(ts, "UTC");
      expect(["09:30", "13:00"]).toContain(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
    }
    expect(new Set([...times, at(4, 9, 30)]).size).toBe(4);
    // The founder's first choice is kept.
    expect([ra!.originalScheduledAt, rb!.originalScheduledAt, rc!.originalScheduledAt]).toEqual([
      at(2, 9, 30),
      at(2, 13),
      at(3, 9, 30),
    ]);
    // Everything else stays where it was.
    expect((await read(t, before))!.scheduledAt).toBe(at(1, 13));
    expect((await read(t, occupied))!.scheduledAt).toBe(at(4, 9, 30));
    expect((await read(t, claimed))!).toMatchObject({ scheduledAt: at(3, 13), status: "claimed" });
  });

  it("keeps an earlier originalScheduledAt, and clearing the vacation moves nothing back", async () => {
    const t = newTest();
    await utcSlots(t, { threads: ["09:30"] });
    const a = await queued(t, "threads", at(2, 9, 30));
    await t.run(async (ctx) => ctx.db.patch(a, { originalScheduledAt: at(1, 9, 30) }));
    await configure(t, { vacation: { from: at(2, 0), to: at(3, 0) } });
    const moved = await read(t, a);
    expect(moved).toMatchObject({ scheduledAt: at(3, 9, 30), originalScheduledAt: at(1, 9, 30) });
    await configure(t, { vacation: null });
    expect((await read(t, a))!.scheduledAt).toBe(at(3, 9, 30));
  });

  it("orders each platform on its own", async () => {
    const t = newTest();
    await utcSlots(t, { threads: ["09:30"], instagram: ["12:00"] });
    const th1 = await queued(t, "threads", at(2, 9, 30));
    const ig1 = await queued(t, "instagram", at(2, 12), "ig-caption-beats");
    const th2 = await queued(t, "threads", at(3, 9, 30));
    const ig2 = await queued(t, "instagram", at(3, 12), "ig-caption-beats");
    await configure(t, { vacation: { from: at(2, 0), to: at(4, 0) } });
    const rows = await Promise.all([th1, th2, ig1, ig2].map((id) => read(t, id)));
    expect(rows.map((r) => r!.scheduledAt)).toEqual([at(4, 9, 30), at(5, 9, 30), at(4, 12), at(5, 12)]);
  });

  it("never puts two reels on one day when moving them", async () => {
    const t = newTest();
    await utcSlots(t, { instagram: ["12:00", "18:30"] });
    const r1 = await queued(t, "instagram", at(2, 12), "reel-script");
    const r2 = await queued(t, "instagram", at(3, 12), "reel-script");
    await configure(t, { vacation: { from: at(2, 0), to: at(4, 0) } });
    const [a, b] = await Promise.all([read(t, r1), read(t, r2)]);
    expect(a!.scheduledAt).toBe(at(4, 12));
    expect(b!.scheduledAt).toBe(at(5, 12));
    expect(a!.scheduledAt).toBeLessThan(b!.scheduledAt);
  });

  it("leaves a post where it is when nothing fits, and the save still succeeds", async () => {
    const t = newTest();
    await utcSlots(t);
    const a = await queued(t, "threads", at(2, 9, 30));
    const saved = await t.mutation(api.settings.update, {
      patch: { slotDays: { threads: [], instagram: ALL_DAYS }, vacation: { from: at(2, 0), to: at(3, 0) } },
    });
    expect(saved.vacation).toEqual({ from: at(2, 0), to: at(3, 0) });
    expect((await read(t, a))!.scheduledAt).toBe(at(2, 9, 30));
    expect((await read(t, a))!.originalScheduledAt).toBeUndefined();
  });

  it("moves nothing when a save does not touch the vacation", async () => {
    const t = newTest();
    await utcSlots(t);
    await configure(t, { vacation: { from: at(2, 0), to: at(3, 0) } });
    const a = await queued(t, "threads", at(2, 9, 30)); // queued inside the window afterwards
    await configure(t, { naturalTiming: false });
    expect((await read(t, a))!.scheduledAt).toBe(at(2, 9, 30));
  });
});

describe("pause on failure", () => {
  async function dueAndFailed(t: TestConvex) {
    const now = Date.now();
    const topic = await insertTopic(t);
    const failedDraft = await insertDraft(t, topic, "threads", "failed one", "k-failed");
    const failed = await insertSlot(t, failedDraft, now - 3 * HOUR, { status: "failed" });
    const dueDraft = await insertDraft(t, topic, "threads", "due one", "k-due");
    const due = await insertSlot(t, dueDraft, now - 10 * MIN);
    return { now, failed, due };
  }

  it("claims nothing while a recent failed post is unresolved", async () => {
    const t = newTest();
    const { now, due } = await dueAndFailed(t);
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([]);
    expect(await statusOf(t, due)).toBe("scheduled");
  });

  it("does not block when the rule is off", async () => {
    const t = newTest();
    await configure(t, { rules: { ...BASE_RULES, pauseOnFailure: false } });
    const { now, due } = await dueAndFailed(t);
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([due]);
  });

  it("does not block on a failure older than 14 days", async () => {
    const t = newTest();
    const { now, failed, due } = await dueAndFailed(t);
    await t.run(async (ctx) => ctx.db.patch(failed, { scheduledAt: now - 15 * DAY }));
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([due]);
  });

  it("lifts when the founder retries the failed post", async () => {
    const t = newTest();
    const { now, failed, due } = await dueAndFailed(t);
    await t.mutation(api.queueBoard.retry, { id: failed });
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([due]);
  });

  it("lifts when the founder cancels the failed post, and keeps the draft", async () => {
    const t = newTest();
    const { now, failed, due } = await dueAndFailed(t);
    const draftId = (await t.run(async (ctx) => ctx.db.get(failed)))!.draftId;
    await t.mutation(api.slots.cancel, { id: failed });
    expect(await t.run(async (ctx) => ctx.db.get(failed))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(draftId))).not.toBeNull();
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([due]);
  });

  it("still refuses to cancel a published or claimed post", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const d = await insertDraft(t, topic);
    const published = await insertSlot(t, d, Date.now() - HOUR, { status: "published" });
    await expect(t.mutation(api.slots.cancel, { id: published })).rejects.toThrow(/BAD_STATE/);
  });
});

describe("natural timing", () => {
  /** A first-attempt slot whose own delay is known, and long enough to see. */
  async function slotWithDelay(t: TestConvex, scheduledAt: number) {
    const topic = await insertTopic(t);
    for (let i = 0; i < 30; i++) {
      const draft = await insertDraft(t, topic, "threads", `body ${i}`, `k${i}`);
      const slot = await insertSlot(t, draft, scheduledAt);
      const jitter = slotJitterMs(slot);
      if (jitter >= 5000) return { slot, jitter };
      await t.run(async (ctx) => ctx.db.delete(slot));
    }
    throw new Error("no slot with a visible delay");
  }

  it("waits out the slot's own delay, never early, then claims it", async () => {
    const t = newTest();
    const scheduledAt = Date.now() - 10 * MIN;
    const { slot, jitter } = await slotWithDelay(t, scheduledAt);
    expect(jitter).toBeLessThan(2 * MIN);
    expect(await t.mutation(internal.slots.claimDue, { now: scheduledAt - 1 })).toEqual([]);
    expect(await t.mutation(internal.slots.claimDue, { now: scheduledAt + jitter - 1 })).toEqual([]);
    expect(await statusOf(t, slot)).toBe("scheduled");
    expect(await t.mutation(internal.slots.claimDue, { now: scheduledAt + jitter })).toEqual([slot]);
  });

  it("does not delay when natural timing is off", async () => {
    const t = newTest();
    await configure(t, { naturalTiming: false });
    const scheduledAt = Date.now() - 10 * MIN;
    const { slot } = await slotWithDelay(t, scheduledAt);
    expect(await t.mutation(internal.slots.claimDue, { now: scheduledAt })).toEqual([slot]);
  });

  it("does not delay a retry or a rescheduled post", async () => {
    const t = newTest();
    const scheduledAt = Date.now() - 10 * MIN;
    const { slot } = await slotWithDelay(t, scheduledAt);
    await t.run(async (ctx) => ctx.db.patch(slot, { attempts: 1 }));
    expect(await t.mutation(internal.slots.claimDue, { now: scheduledAt })).toEqual([slot]);
  });
});

describe("mix pillars on queueTopic", () => {
  async function pillarTopic(t: TestConvex, pillar: string, title: string) {
    const topic = await insertTopic(t, title);
    await t.run(async (ctx) => ctx.db.patch(topic, { pillar }));
    const draft = await insertDraft(t, topic, "threads", `post for ${title}`, "threads-hook-story");
    return { topic, draft };
  }
  /** The first four free Threads slots from now. */
  function firstFour(now: number) {
    const plan = { times: ["09:30", "13:00", "19:00"], days: ALL_DAYS, tz: "UTC", taken: [] as number[] };
    const s1 = nextFreeSlot({ ...plan, afterMs: now });
    const s2 = nextFreeSlot({ ...plan, afterMs: s1 });
    const s3 = nextFreeSlot({ ...plan, afterMs: s2 });
    const s4 = nextFreeSlot({ ...plan, afterMs: s3 });
    return [s1, s2, s3, s4];
  }

  it("skips a slot next to a post of the same pillar", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { mixPillars: true, dailyCap: { threads: 10, instagram: 3 } } });
    const [s1, , s3, s4] = firstFour(Date.now());
    const a1 = await pillarTopic(t, "build", "A1");
    const b = await pillarTopic(t, "tools", "B");
    await t.mutation(api.slots.enqueue, { draftId: a1.draft, scheduledAt: s1 });
    await t.mutation(api.slots.enqueue, { draftId: b.draft, scheduledAt: s3 });

    const a2 = await pillarTopic(t, "build", "A2");
    const out = await t.mutation(api.slots.queueTopic, { topicId: a2.topic });
    // s2 sits right after another "build" post; s4 follows the "tools" post.
    expect(out.queued.map((q) => q.scheduledAt)).toEqual([s4]);
  });

  it("takes the next free slot when the rule is off", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { mixPillars: false, dailyCap: { threads: 10, instagram: 3 } } });
    const [s1, s2, s3] = firstFour(Date.now());
    const a1 = await pillarTopic(t, "build", "A1");
    const b = await pillarTopic(t, "tools", "B");
    await t.mutation(api.slots.enqueue, { draftId: a1.draft, scheduledAt: s1 });
    await t.mutation(api.slots.enqueue, { draftId: b.draft, scheduledAt: s3 });
    const a2 = await pillarTopic(t, "build", "A2");
    const out = await t.mutation(api.slots.queueTopic, { topicId: a2.topic });
    expect(out.queued.map((q) => q.scheduledAt)).toEqual([s2]);
  });

  it("never refuses to mix: with no mixed slot in reach it takes the first free one", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { mixPillars: true, dailyCap: { threads: 10, instagram: 3 } } });
    const [s1, s2] = firstFour(Date.now());
    const a1 = await pillarTopic(t, "build", "A1");
    await t.mutation(api.slots.enqueue, { draftId: a1.draft, scheduledAt: s1 });
    const a2 = await pillarTopic(t, "build", "A2");
    const out = await t.mutation(api.slots.queueTopic, { topicId: a2.topic });
    expect(out.skipped.filter((s) => s.code !== "NO_DRAFT")).toEqual([]);
    expect(out.queued.map((q) => q.scheduledAt)).toEqual([s2]);
  });

  it("does not block a slot the founder picked", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { mixPillars: true, dailyCap: { threads: 10, instagram: 3 } } });
    const [s1, s2] = firstFour(Date.now());
    const a1 = await pillarTopic(t, "build", "A1");
    const a2 = await pillarTopic(t, "build", "A2");
    await t.mutation(api.slots.enqueue, { draftId: a1.draft, scheduledAt: s1 });
    const out = await t.mutation(api.slots.enqueue, { draftId: a2.draft, scheduledAt: s2 });
    expect(out.scheduledAt).toBe(s2);
  });
});

describe("one reel a day", () => {
  const MEDIA_URL = "https://files.example.test/clip.mp4";

  async function reelTopic(t: TestConvex, title: string) {
    const topic = await insertTopic(t, title);
    const draft = await insertDraft(t, topic, "instagram", `reel for ${title}`, "reel-script");
    const asset = await t.run(async (ctx) =>
      ctx.db.insert("mediaAssets", {
        storageId: `external:${MEDIA_URL}`,
        publicUrl: MEDIA_URL,
        mimeType: "video/mp4",
        verifiedAt: Date.now(),
        createdAt: Date.now(),
      })
    );
    await t.run(async (ctx) => ctx.db.patch(draft, { mediaAssetId: asset }));
    return { topic, draft };
  }
  const rulesWith = (oneReelPerDay: boolean) => ({
    mixPillars: false,
    oneReelPerDay,
    dailyCap: { threads: 5, instagram: 3 },
  });

  it("auto placement skips a day that already has a reel", async () => {
    const t = newTest();
    await utcSlots(t, { rules: rulesWith(true) });
    const r1 = await reelTopic(t, "R1");
    const r2 = await reelTopic(t, "R2");
    const first = await t.mutation(api.slots.queueTopic, { topicId: r1.topic });
    const second = await t.mutation(api.slots.queueTopic, { topicId: r2.topic });
    const d1 = dayKey(first.queued[0].scheduledAt, "UTC");
    const d2 = dayKey(second.queued[0].scheduledAt, "UTC");
    expect(d2).not.toBe(d1);
    expect(second.queued[0].scheduledAt).toBeGreaterThan(first.queued[0].scheduledAt);
  });

  it("auto placement uses the same day's other slot when the rule is off", async () => {
    const t = newTest();
    await utcSlots(t, { rules: rulesWith(false) });
    const r1 = await reelTopic(t, "R1");
    const r2 = await reelTopic(t, "R2");
    const first = await t.mutation(api.slots.queueTopic, { topicId: r1.topic });
    const second = await t.mutation(api.slots.queueTopic, { topicId: r2.topic });
    expect(dayKey(second.queued[0].scheduledAt, "UTC")).toBe(dayKey(first.queued[0].scheduledAt, "UTC"));
  });

  it("enqueue into a day that already has a reel is refused with the exact message", async () => {
    const t = newTest();
    await utcSlots(t, { rules: rulesWith(true) });
    const r1 = await reelTopic(t, "R1");
    const r2 = await reelTopic(t, "R2");
    await t.mutation(api.slots.enqueue, { draftId: r1.draft, scheduledAt: at(3, 12) });
    await expect(t.mutation(api.slots.enqueue, { draftId: r2.draft, scheduledAt: at(3, 18, 30) })).rejects.toThrow(
      REEL_REFUSAL
    );
    // Another day is fine, and so is moving the reel within its own day.
    await t.mutation(api.slots.enqueue, { draftId: r2.draft, scheduledAt: at(4, 12) });
    const own = (await t.query(api.slots.week, { from: at(3, 0), days: 1 }))[0];
    await t.mutation(api.slots.reschedule, { id: own._id as Id<"slots">, scheduledAt: at(3, 18, 30) });
  });

  it("reschedule onto a day that already has a reel is refused", async () => {
    const t = newTest();
    await utcSlots(t, { rules: rulesWith(true) });
    const r1 = await reelTopic(t, "R1");
    const r2 = await reelTopic(t, "R2");
    await t.mutation(api.slots.enqueue, { draftId: r1.draft, scheduledAt: at(3, 12) });
    const second = await t.mutation(api.slots.enqueue, { draftId: r2.draft, scheduledAt: at(4, 12) });
    await expect(
      t.mutation(api.slots.reschedule, { id: second.slotId, scheduledAt: at(3, 18, 30) })
    ).rejects.toThrow(REEL_REFUSAL);
  });

  it("a caption on a reel's day is fine, and the rule off allows a second reel", async () => {
    const t = newTest();
    await utcSlots(t, { rules: rulesWith(true) });
    const r1 = await reelTopic(t, "R1");
    await t.mutation(api.slots.enqueue, { draftId: r1.draft, scheduledAt: at(3, 12) });
    const topic = await insertTopic(t, "Caption");
    const caption = await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats");
    const asset = await t.run(async (ctx) => ctx.db.query("mediaAssets").first());
    await t.run(async (ctx) => ctx.db.patch(caption, { mediaAssetId: asset!._id }));
    await t.mutation(api.slots.enqueue, { draftId: caption, scheduledAt: at(3, 18, 30) });

    await configure(t, { rules: { ...BASE_RULES, ...rulesWith(false) } });
    const r2 = await reelTopic(t, "R2");
    const out = await t.mutation(api.slots.enqueue, { draftId: r2.draft, scheduledAt: at(3, 19) });
    expect(out.scheduledAt).toBe(at(3, 19));
  });
});

describe("daily cap on explicit placement", () => {
  it("refuses a post past the cap for that day, naming the cap and the platform", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { dailyCap: { threads: 2, instagram: 3 } } });
    const topic = await insertTopic(t);
    const drafts = await Promise.all(
      ["k1", "k2", "k3", "k4"].map((key) => insertDraft(t, topic, "threads", `post ${key}`, key))
    );
    await t.mutation(api.slots.enqueue, { draftId: drafts[0], scheduledAt: at(3, 9, 30) });
    await t.mutation(api.slots.enqueue, { draftId: drafts[1], scheduledAt: at(3, 13) });
    const refusal = t.mutation(api.slots.enqueue, { draftId: drafts[2], scheduledAt: at(3, 19) });
    await expect(refusal).rejects.toThrow(/DAILY_CAP: Threads already has 2 posts that day, and your daily cap is 2/);
    // The next day is open, and the refused draft was not queued.
    await t.mutation(api.slots.enqueue, { draftId: drafts[3], scheduledAt: at(4, 9, 30) });
    expect(await t.query(api.slots.countScheduledByPlatform, { platform: "threads" })).toBe(3);
  });

  it("counts the cap per platform", async () => {
    const t = newTest();
    await utcSlots(t, { rules: { dailyCap: { threads: 1, instagram: 3 } } });
    const topic = await insertTopic(t);
    const a = await insertDraft(t, topic, "threads", "a", "k1");
    const b = await insertDraft(t, topic, "threads", "b", "k2");
    await t.mutation(api.slots.enqueue, { draftId: a, scheduledAt: at(3, 9, 30) });
    await expect(t.mutation(api.slots.enqueue, { draftId: b, scheduledAt: at(3, 13) })).rejects.toThrow(/DAILY_CAP/);
  });
});

describe("the tick says why it is holding", () => {
  it("dry run: logs the vacation hold and reports it", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = newTest();
    const now = Date.now();
    await configure(t, { vacation: { from: now - HOUR, to: now + HOUR } });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    await insertSlot(t, draft, now - 10 * MIN);
    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ dryRun: true, claimed: 0, hold: "vacation" });
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("DRY RUN") && l.includes("holding for vacation"))).toBe(true);
    expect(lines.some((l) => l.includes("would claim"))).toBe(false);
  });

  it("dry run: logs the failure hold", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    const d1 = await insertDraft(t, topic, "threads", "x", "k1");
    await insertSlot(t, d1, now - 3 * HOUR, { status: "failed" });
    const d2 = await insertDraft(t, topic, "threads", "y", "k2");
    await insertSlot(t, d2, now - 10 * MIN);
    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ dryRun: true, hold: "failure" });
    expect(log.mock.calls.some((c) => String(c[0]).includes("holding because a post failed"))).toBe(true);
  });

  it("dry run without a hold has no hold and still lists what it would claim", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    await insertSlot(t, draft, Date.now() - 10 * MIN);
    const out = await t.action(internal.publish.tick, {});
    expect(out.hold).toBeUndefined();
    expect(log.mock.calls.some((c) => String(c[0]).includes("would claim"))).toBe(true);
  });

  it("live: claims nothing and calls no provider during a vacation", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const t = newTest();
    const now = Date.now();
    await configure(t, { vacation: { from: now - HOUR, to: now + HOUR } });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, now - 10 * MIN);
    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ dryRun: false, claimed: 0, published: 0, hold: "vacation" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await statusOf(t, slot)).toBe("scheduled");
  });
});

describe("publishLog.mode reports the hold", () => {
  it("names the vacation end, or the failed post, and nothing when there is no hold", async () => {
    const t = newTest();
    const now = Date.now();
    expect((await t.query(api.publishLog.mode, { now })).hold).toBeNull();

    await configure(t, { vacation: { from: now - HOUR, to: now + 2 * DAY }, timezone: "Asia/Kolkata" });
    expect(await t.query(api.publishLog.mode, { now })).toMatchObject({
      hold: { reason: "vacation", until: now + 2 * DAY },
      tz: "Asia/Kolkata",
    });
    // Without a clock the query cannot know, so it reports no hold.
    expect((await t.query(api.publishLog.mode, {})).hold).toBeNull();

    await configure(t, { vacation: null });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    await insertSlot(t, draft, now - 3 * HOUR, { status: "failed" });
    expect((await t.query(api.publishLog.mode, { now })).hold).toEqual({ reason: "failure" });
    await configure(t, { rules: { ...BASE_RULES, pauseOnFailure: false } });
    expect((await t.query(api.publishLog.mode, { now })).hold).toBeNull();
  });
});
