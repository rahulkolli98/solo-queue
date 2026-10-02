import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { dayKey, zonedWallToUtc } from "./lib/zoned";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const TZ = "Asia/Kolkata";
const DAY = 86400000;

async function startOfToday(): Promise<number> {
  const k = dayKey(Date.now(), TZ).split("-").map(Number);
  return zonedWallToUtc({ year: k[0], month: k[1], day: k[2], hour: 0, minute: 0 }, TZ);
}

async function configure(t: ReturnType<typeof newTest>) {
  await t.mutation(api.settings.update, {
    patch: { timezone: TZ, slotDefaults: { threads: ["09:30", "13:00", "19:00"], instagram: ["12:00"] } },
  });
}

describe("queueBoard.dayColumns", () => {
  it("returns one column per day with slots grouped by platform and open slot times", async () => {
    const t = newTest();
    await configure(t);
    const from = await startOfToday();
    const topic = await insertTopic(t, "Fees");
    const draft = await insertDraft(t, topic, "threads", "Hello\n---\nSecond");
    const tomorrow = dayKey(from + 36 * 3600000, TZ).split("-").map(Number);
    const at = zonedWallToUtc({ year: tomorrow[0], month: tomorrow[1], day: tomorrow[2], hour: 13, minute: 0 }, TZ);
    await insertSlot(t, draft, at);

    const out = await t.query(api.queueBoard.dayColumns, { from, days: 7 });
    expect(out.tz).toBe(TZ);
    expect(out.days).toHaveLength(7);
    const day = out.days.find((d) => d.threads.length > 0)!;
    expect(day.threads[0]).toMatchObject({ time: "13:00", status: "scheduled", topicTitle: "Fees", snippet: "Hello" });
    // 13:00 is taken; the other two Threads times are open (if still in the future).
    expect(day.open.threads).not.toContain("13:00");
    expect(day.open.threads).toEqual(expect.arrayContaining(["09:30", "19:00"]));
  });

  it("shows published and failed posts in their day", async () => {
    const t = newTest();
    await configure(t);
    const from = await startOfToday();
    const topic = await insertTopic(t);
    const d1 = await insertDraft(t, topic, "threads", "a", "k1");
    const d2 = await insertDraft(t, topic, "threads", "b", "k2");
    const k = dayKey(from + 3 * DAY, TZ).split("-").map(Number);
    await insertSlot(t, d1, zonedWallToUtc({ year: k[0], month: k[1], day: k[2], hour: 9, minute: 30 }, TZ), { status: "published" });
    await insertSlot(t, d2, zonedWallToUtc({ year: k[0], month: k[1], day: k[2], hour: 13, minute: 0 }, TZ), { status: "failed" });
    const out = await t.query(api.queueBoard.dayColumns, { from, days: 7 });
    const day = out.days.find((d) => d.threads.length === 2)!;
    expect(day.threads.map((c) => c.status)).toEqual(["published", "failed"]);
  });

  it("falls back to the browser zone while the saved zone is auto", async () => {
    const t = newTest();
    const out = await t.query(api.queueBoard.dayColumns, { from: Date.now(), days: 2, tz: TZ });
    expect(out.tz).toBe(TZ);
  });
});

describe("queueBoard.detail / retry / requeue", () => {
  it("returns the post, topic and receipts newest first", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "T");
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, Date.now() + 60000, { status: "failed", attempts: 2 });
    await t.run(async (ctx) => {
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: 1000, outcome: "retryable", providerMessage: "timeout" });
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: 2000, outcome: "permanent", providerMessage: "bad media" });
    });
    const out = await t.query(api.queueBoard.detail, { id: slot });
    expect(out?.topic?.title).toBe("T");
    expect(out?.receipts.map((r) => r.providerMessage)).toEqual(["bad media", "timeout"]);
    expect(await t.run(async (ctx) => { await ctx.db.delete(slot); return null; })).toBeNull();
    expect(await t.query(api.queueBoard.detail, { id: slot })).toBeNull();
  });

  it("retry puts a failed slot back with fresh attempts and keeps the receipts", async () => {
    const t = newTest();
    await configure(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, Date.now() - 1000, { status: "failed", attempts: 5 });
    await t.run(async (ctx) => {
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: 1, outcome: "permanent" });
    });
    const out = await t.mutation(api.queueBoard.retry, { id: slot });
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row).toMatchObject({ status: "scheduled", attempts: 0 });
    expect((await t.query(api.queueBoard.detail, { id: slot }))?.receipts).toHaveLength(1);
  });

  it("retry only accepts failed slots and future times", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const scheduled = await insertSlot(t, draft, Date.now() + 60000);
    await expect(t.mutation(api.queueBoard.retry, { id: scheduled })).rejects.toThrow(/BAD_STATE/);
    const failed = await insertSlot(t, draft, Date.now() - 1000, { status: "failed" });
    await expect(
      t.mutation(api.queueBoard.retry, { id: failed, scheduledAt: Date.now() - 5 })
    ).rejects.toThrow(/BAD_TIME/);
  });

  it("requeue respects the rest period, then adds a new slot and keeps the original", async () => {
    const t = newTest();
    await configure(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const recent = await insertSlot(t, draft, Date.now() - DAY, { status: "published" });
    await t.run(async (ctx) => ctx.db.patch(recent, { publishedAt: Date.now() - DAY }));
    await expect(t.mutation(api.queueBoard.requeue, { id: recent })).rejects.toThrow(/REST_PERIOD/);

    const old = await insertSlot(t, draft, Date.now() - 60 * DAY, { status: "published" });
    await t.run(async (ctx) => ctx.db.patch(old, { publishedAt: Date.now() - 60 * DAY }));
    const out = await t.mutation(api.queueBoard.requeue, { id: old });
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
    const all = await t.run(async (ctx) => ctx.db.query("slots").collect());
    expect(all.filter((s) => s.draftId === draft)).toHaveLength(3);
    expect((await t.run(async (ctx) => ctx.db.get(old)))?.status).toBe("published");
  });

  it("requeue refuses a slot that has not published", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const s = await insertSlot(t, draft, Date.now() + 1000);
    await expect(t.mutation(api.queueBoard.requeue, { id: s })).rejects.toThrow(/BAD_STATE/);
  });
});
