import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { zonedParts } from "./lib/zoned";
import { insertDraft, insertTopic, newTest } from "../src/test-utils/convex";

const KOLKATA = "Asia/Kolkata";

async function setSettings(t: ReturnType<typeof newTest>, patch: Record<string, unknown>) {
  await t.mutation(api.settings.update, { patch });
}

describe("slots.enqueue with the typed settings", () => {
  it("picks the next slot at the founder's time in their time zone", async () => {
    const t = newTest();
    await setSettings(t, {
      timezone: KOLKATA,
      slotDefaults: { threads: ["09:30"], instagram: ["12:00"] },
    });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const out = await t.mutation(api.slots.enqueue, { draftId: draft });
    const p = zonedParts(out.scheduledAt, KOLKATA);
    expect(`${p.hour}:${p.minute}`).toBe("9:30");
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("uses the browser zone while the saved zone is still auto", async () => {
    const t = newTest();
    await setSettings(t, { slotDefaults: { threads: ["09:30"], instagram: ["12:00"] } });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const out = await t.mutation(api.slots.enqueue, { draftId: draft, tz: KOLKATA });
    expect(zonedParts(out.scheduledAt, KOLKATA)).toMatchObject({ hour: 9, minute: 30 });
  });

  it("moves to the next day when the daily cap is reached", async () => {
    const t = newTest();
    await setSettings(t, {
      timezone: KOLKATA,
      slotDefaults: { threads: ["09:30", "13:00"], instagram: ["12:00"] },
      rules: {
        mixPillars: true,
        evergreenRestDays: 30,
        fillGaps: "ask",
        oneReelPerDay: true,
        pauseOnFailure: true,
        dailyCap: { threads: 1, instagram: 1 },
      },
    });
    const topic = await insertTopic(t);
    const d1 = await insertDraft(t, topic, "threads", "one", "threads-hook-story");
    const d2 = await insertDraft(t, topic, "threads", "two", "other-threads-key");
    const a = await t.mutation(api.slots.enqueue, { draftId: d1 });
    const b = await t.mutation(api.slots.enqueue, { draftId: d2 });
    const da = zonedParts(a.scheduledAt, KOLKATA);
    const db = zonedParts(b.scheduledAt, KOLKATA);
    expect(`${da.year}-${da.month}-${da.day}`).not.toBe(`${db.year}-${db.month}-${db.day}`);
  });

  it("skips vacation days", async () => {
    const t = newTest();
    const now = Date.now();
    await setSettings(t, {
      timezone: "UTC",
      slotDefaults: { threads: ["09:30"], instagram: ["12:00"] },
      vacation: { from: now, to: now + 3 * 86400000 },
    });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const out = await t.mutation(api.slots.enqueue, { draftId: draft });
    expect(out.scheduledAt).toBeGreaterThan(now + 3 * 86400000);
  });

  it("refuses with a readable code: no media, already queued, blog drafts", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const ig = await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats");
    await expect(t.mutation(api.slots.enqueue, { draftId: ig })).rejects.toThrow(/MEDIA_REQUIRED/);

    const th = await insertDraft(t, topic, "threads");
    await t.mutation(api.slots.enqueue, { draftId: th });
    await expect(t.mutation(api.slots.enqueue, { draftId: th })).rejects.toThrow(/ALREADY_QUEUED/);

    const blog = await insertDraft(t, topic, "blog", "post", "blog-draft");
    await expect(t.mutation(api.slots.enqueue, { draftId: blog })).rejects.toThrow(/UNSUPPORTED_PLATFORM/);
  });

  it("refuses an over-limit Threads post and a past time", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const long = await insertDraft(t, topic, "threads", "x".repeat(501));
    await expect(t.mutation(api.slots.enqueue, { draftId: long })).rejects.toThrow(/OVER_LIMIT/);
    const ok = await insertDraft(t, topic, "threads", "fine", "other-key");
    await expect(
      t.mutation(api.slots.enqueue, { draftId: ok, scheduledAt: Date.now() - 1000 })
    ).rejects.toThrow(/BAD_TIME/);
  });
});

describe("slots.queueTopic", () => {
  it("queues what can be queued and reports what was skipped and why", async () => {
    const t = newTest();
    await setSettings(t, { timezone: KOLKATA });
    const topic = await insertTopic(t);
    await insertDraft(t, topic, "threads", "A thread", "threads-hook-story");
    await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats"); // no media attached
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic });
    expect(out.queued.map((q) => q.format)).toEqual(["Threads"]);
    const skipped = Object.fromEntries(out.skipped.map((s) => [s.format, s.code]));
    expect(skipped["IG caption"]).toBe("MEDIA_REQUIRED");
    expect(skipped["IG reel"]).toBe("NO_DRAFT");
    expect((await t.query(api.topics.get, { id: topic }))?.status).toBe("queued");
  });

  it("spreads two queued topics across different slots", async () => {
    const t = newTest();
    await setSettings(t, { timezone: KOLKATA });
    const a = await insertTopic(t, "A");
    const b = await insertTopic(t, "B");
    await insertDraft(t, a, "threads", "a", "threads-hook-story");
    await insertDraft(t, b, "threads", "b", "threads-hook-story");
    const first = await t.mutation(api.slots.queueTopic, { topicId: a });
    const second = await t.mutation(api.slots.queueTopic, { topicId: b });
    expect(first.queued[0].scheduledAt).not.toBe(second.queued[0].scheduledAt);
  });
});
