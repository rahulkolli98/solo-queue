import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { insertDraft, insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

/**
 * TASK-043 (FR-013, evergreen recycle): mark a published post evergreen, requeue it into the next
 * free slot once the rest period is over, with the original and its receipts left as history.
 *
 * Asserts statuses, codes, counts, ids, times and database state only, never message wording.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const THREADS_API = "https://graph.threads.com/v1.0";
// A fixed Monday, 06:00 UTC.
const DAY0 = Date.UTC(2026, 5, 1);
const T0 = DAY0 + 6 * HOUR;
const REST_DAYS = DEFAULT_SETTINGS.rules.evergreenRestDays;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("PUBLISH_DRY_RUN", "0");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A small fake of the Threads API: container, status poll, publish. */
function fakeThreads() {
  const posts: { text: string; replyTo: string | null; container: string; media: string }[] = [];
  const pending = new Map<string, { text: string; replyTo: string | null }>();
  let containers = 0;
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST" && url === `${THREADS_API}/u1/threads`) {
      const body = JSON.parse(String(init?.body));
      containers += 1;
      const id = `c${containers}`;
      pending.set(id, { text: body.text, replyTo: body.reply_to_id ?? null });
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    if (method === "POST" && url === `${THREADS_API}/u1/threads_publish`) {
      const body = JSON.parse(String(init?.body));
      const c = pending.get(body.creation_id)!;
      const media = `m${posts.length + 1}`;
      posts.push({ text: c.text, replyTo: c.replyTo, container: body.creation_id, media });
      return new Response(JSON.stringify({ id: media }), { status: 200 });
    }
    if (method === "GET" && url.includes("fields=status")) return new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 });
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { impl, posts };
}

async function setup(t: TestConvex, rules: Partial<typeof DEFAULT_SETTINGS.rules> = {}) {
  await t.mutation(api.settings.update, {
    patch: {
      timezone: "UTC",
      slotDefaults: { threads: ["10:00", "15:00"], instagram: ["11:00"] },
      slotDays: { threads: [0, 1, 2, 3, 4, 5, 6], instagram: [0, 1, 2, 3, 4, 5, 6] },
      rules: { ...DEFAULT_SETTINGS.rules, mixPillars: false, ...rules },
    },
  });
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "threads",
      platformUserId: "u1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: T0 + 400 * DAY,
      scopes: [],
      status: "healthy",
      lastCheckedAt: T0,
    })
  );
}

const getSlot = (t: TestConvex, id: Id<"slots">) => t.run(async (ctx) => ctx.db.get(id));
const receiptsOf = (t: TestConvex, slotId: Id<"slots">) =>
  t.run(async (ctx) => ctx.db.query("publishReceipts").withIndex("by_slot", (q) => q.eq("slotId", slotId)).collect());
const slotsOfDraft = (t: TestConvex, draftId: Id<"drafts">) =>
  t.run(async (ctx) => ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", draftId)).collect());

/** A Threads post that really went out through the publisher tick at the pinned time. */
async function publishThroughTick(t: TestConvex, body = "A post that keeps working.") {
  const topic = await insertTopic(t, "Evergreen topic");
  const draft = await insertDraft(t, topic, "threads", body, "threads-hook-story");
  const slot = await insertSlot(t, draft, Date.now() - 5 * MIN);
  const tick = await t.action(internal.publish.tick, {});
  expect(tick).toMatchObject({ claimed: 1, published: 1, failed: 0 });
  return { topic, draft, slot };
}

describe("evergreen requeue: the rest period", () => {
  it("refuses before the rest period (REST_PERIOD) and allows it exactly when it is over, creating no slot while refused", async () => {
    vi.stubGlobal("fetch", fakeThreads().impl);
    const t = newTest();
    await setup(t);
    const { draft, slot } = await publishThroughTick(t);
    const published = await getSlot(t, slot);
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).toBe(T0);
    await t.mutation(api.queueBoard.setEvergreen, { id: slot, evergreen: true });
    expect((await getSlot(t, slot))?.evergreen).toBe(true);

    // The day after, and one millisecond short of the rest period: refused, nothing created.
    for (const now of [T0 + DAY, T0 + REST_DAYS * DAY - 1]) {
      vi.setSystemTime(now);
      await expect(t.mutation(api.queueBoard.requeue, { id: slot })).rejects.toThrow(/VALIDATION:REST_PERIOD:/);
      expect(await slotsOfDraft(t, draft)).toHaveLength(1);
    }

    // The library says the same thing before and after.
    vi.setSystemTime(T0 + 10 * DAY);
    const early = (await t.query(api.library.published, { now: Date.now() })).find((p) => p.slotId === slot);
    expect(early).toMatchObject({ evergreen: true, canRequeue: false, restDaysLeft: REST_DAYS - 10 });

    vi.setSystemTime(T0 + REST_DAYS * DAY);
    const late = (await t.query(api.library.published, { now: Date.now() })).find((p) => p.slotId === slot);
    expect(late).toMatchObject({ evergreen: true, canRequeue: true, restDaysLeft: 0 });
    const out = await t.mutation(api.queueBoard.requeue, { id: slot });
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
    expect(await slotsOfDraft(t, draft)).toHaveLength(2);
  });

  it("follows the rest period saved in settings, not a fixed number", async () => {
    vi.stubGlobal("fetch", fakeThreads().impl);
    const t = newTest();
    await setup(t, { evergreenRestDays: 10 });
    const { slot } = await publishThroughTick(t);
    await t.mutation(api.queueBoard.setEvergreen, { id: slot, evergreen: true });

    vi.setSystemTime(T0 + 10 * DAY - 1);
    await expect(t.mutation(api.queueBoard.requeue, { id: slot })).rejects.toThrow(/VALIDATION:REST_PERIOD:/);
    vi.setSystemTime(T0 + 10 * DAY);
    const out = await t.mutation(api.queueBoard.requeue, { id: slot });
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
  });

  it("only a published post can be requeued", async () => {
    const t = newTest();
    await setup(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    for (const status of ["scheduled", "claimed", "failed"] as const) {
      const slot = await insertSlot(t, draft, T0 + HOUR, { status });
      await expect(t.mutation(api.queueBoard.requeue, { id: slot })).rejects.toThrow(/VALIDATION:BAD_STATE:/);
    }
    expect(await slotsOfDraft(t, draft)).toHaveLength(3);
  });

  // GAP (reported, not enforced by the product): `queueBoard.requeue` checks the status, the rest period, an
  // existing open slot and the media, but never reads `slot.evergreen`. The Library UI also shows Requeue on every
  // published postcard. A post that was never marked evergreen can be requeued today. When the product enforces the
  // mark, replace this todo with: publish a post, do NOT mark it, move past the rest period, expect requeue to be
  // refused with a VALIDATION code and no second slot; then mark it and expect it to be allowed.
  it.todo("a published post that was never marked evergreen cannot be requeued (not enforced by queueBoard.requeue yet)");
});

describe("evergreen requeue: next free slot, history preserved, publishes again", () => {
  it("creates a NEW scheduled slot for the same draft, leaves the original and its receipts untouched, and publishes it through the real tick with two separate receipts", async () => {
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await setup(t);
    const { topic, draft, slot: original } = await publishThroughTick(t, "The post that holds up.");
    await t.mutation(api.queueBoard.setEvergreen, { id: original, evergreen: true });

    const originalRow = await getSlot(t, original);
    const originalReceipts = await receiptsOf(t, original);
    expect(originalRow).toMatchObject({ status: "published", publishedPlatformId: "m1", evergreen: true });
    expect(originalReceipts.map((r) => r.outcome)).toEqual(["success"]);

    // Past the rest period: requeue.
    vi.setSystemTime(T0 + REST_DAYS * DAY);
    const out = await t.mutation(api.queueBoard.requeue, { id: original });

    // The next free slot is the first list time after "now" on that day.
    expect(out.scheduledAt).toBe(DAY0 + REST_DAYS * DAY + 10 * HOUR);
    expect(out.slotId).not.toBe(original);

    // A NEW slot for the same draft; it is not marked as published.
    const requeued = await getSlot(t, out.slotId);
    expect(requeued).toMatchObject({
      platform: "threads",
      draftId: draft,
      status: "scheduled",
      scheduledAt: out.scheduledAt,
      attempts: 0,
      evergreen: true,
    });
    expect(requeued?.publishedAt).toBeUndefined();
    expect(requeued?.publishedPlatformId).toBeUndefined();
    expect(requeued?.containerId).toBeUndefined();
    expect(requeued?.lastError).toBeUndefined();

    // The original and its receipts are exactly what they were: same count, same ids, same content.
    expect(await getSlot(t, original)).toEqual(originalRow);
    expect(await receiptsOf(t, original)).toEqual(originalReceipts);
    expect(await receiptsOf(t, out.slotId)).toEqual([]);
    const draftSlots = await slotsOfDraft(t, draft);
    expect(draftSlots.map((s) => s._id).sort()).toEqual([original, out.slotId].sort());
    expect(draftSlots.filter((s) => s.status === "published").map((s) => s._id)).toEqual([original]);

    // A second requeue while the first is still waiting is refused and adds nothing.
    await expect(t.mutation(api.queueBoard.requeue, { id: original })).rejects.toThrow(/VALIDATION:ALREADY_QUEUED:/);
    expect(await slotsOfDraft(t, draft)).toHaveLength(2);

    // The real publisher tick sends it when it is due.
    vi.setSystemTime(out.scheduledAt + 5 * MIN);
    const tick = await t.action(internal.publish.tick, {});
    expect(tick).toMatchObject({ dryRun: false, claimed: 1, published: 1, failed: 0 });

    const second = await getSlot(t, out.slotId);
    expect(second).toMatchObject({ status: "published", publishedPlatformId: "m2" });
    expect(second?.publishedAt).toBe(Date.now());
    expect(second!.publishedAt!).toBeGreaterThan(originalRow!.publishedAt!);

    // Two posts went out, with the same words, one container each.
    expect(fake.posts.map((p) => [p.text, p.replyTo])).toEqual([
      ["The post that holds up.", null],
      ["The post that holds up.", null],
    ]);
    expect(new Set(fake.posts.map((p) => p.container)).size).toBe(2);

    // The draft now has two published slots, each with its own single success receipt, in order.
    const finalSlots = await slotsOfDraft(t, draft);
    expect(finalSlots).toHaveLength(2);
    expect(finalSlots.every((s) => s.status === "published")).toBe(true);
    const firstReceipts = await receiptsOf(t, original);
    const secondReceipts = await receiptsOf(t, out.slotId);
    expect(firstReceipts).toEqual(originalReceipts);
    expect(secondReceipts.map((r) => r.outcome)).toEqual(["success"]);
    expect(secondReceipts[0].slotId).toBe(out.slotId);
    expect(firstReceipts[0]._id).not.toBe(secondReceipts[0]._id);
    expect(secondReceipts[0].attemptedAt).toBeGreaterThan(firstReceipts[0].attemptedAt);
    const log = await t.run(async (ctx) => ctx.db.query("publishReceipts").withIndex("by_creation_time").collect());
    expect(log.map((r) => r.slotId)).toEqual([original, out.slotId]);
    // The original is still untouched after the second publish.
    expect(await getSlot(t, original)).toEqual(originalRow);

    // The slot drawer shows each slot with its own history.
    expect((await t.query(api.queueBoard.detail, { id: original }))?.receipts.map((r) => r._id)).toEqual([firstReceipts[0]._id]);
    expect((await t.query(api.queueBoard.detail, { id: out.slotId }))?.receipts.map((r) => r._id)).toEqual([secondReceipts[0]._id]);

    // The Library lists both posts (newest first); the new one keeps the evergreen mark, so it can come round again.
    const lib = (await t.query(api.library.published, { now: Date.now() })).filter((p) => p.topicTitle === "Evergreen topic");
    expect(lib.map((p) => p.slotId)).toEqual([out.slotId, original]);
    expect(lib.map((p) => p.evergreen)).toEqual([true, true]);
    expect(lib.map((p) => p.canRequeue)).toEqual([false, true]);
    expect((await t.run(async (ctx) => ctx.db.get(topic)))?.status).toBe("done");
  });

  it("skips a slot that is already taken: the requeue lands on the next free time", async () => {
    vi.stubGlobal("fetch", fakeThreads().impl);
    const t = newTest();
    await setup(t);
    const { slot } = await publishThroughTick(t);
    await t.mutation(api.queueBoard.setEvergreen, { id: slot, evergreen: true });
    vi.setSystemTime(T0 + REST_DAYS * DAY);

    // Someone else holds the first list time of that day.
    const other = await insertDraft(t, await insertTopic(t, "Other"), "threads", "Other post", "k-other");
    await insertSlot(t, other, DAY0 + REST_DAYS * DAY + 10 * HOUR);

    const out = await t.mutation(api.queueBoard.requeue, { id: slot });
    expect(out.scheduledAt).toBe(DAY0 + REST_DAYS * DAY + 15 * HOUR);
  });
});
