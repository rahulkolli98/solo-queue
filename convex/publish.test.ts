import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const MIN = 60_000;
const API = "https://graph.threads.com/v1.0";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function connectThreads(t: ReturnType<typeof newTest>) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "threads",
      platformUserId: "u1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: Date.now() + 40 * 86400000,
      scopes: [],
      status: "healthy",
      lastCheckedAt: Date.now(),
    })
  );
}

/** A tiny fake of the Threads API: containers, status polling, publish and replies. */
function fakeThreads(opts: { failReplyAt?: number } = {}) {
  const posts: { text: string; replyTo: string | null; container: string; media: string }[] = [];
  let containers = 0;
  const pending = new Map<string, { text: string; replyTo: string | null }>();
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST" && url === `${API}/u1/threads`) {
      const body = JSON.parse(String(init?.body));
      if (opts.failReplyAt !== undefined && body.reply_to_id && posts.length === opts.failReplyAt - 1) {
        return new Response(JSON.stringify({ error_message: "rate limited" }), { status: 400 });
      }
      containers += 1;
      const id = `c${containers}`;
      pending.set(id, { text: body.text, replyTo: body.reply_to_id ?? null });
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
    if (method === "POST" && url === `${API}/u1/threads_publish`) {
      const body = JSON.parse(String(init?.body));
      const c = pending.get(body.creation_id)!;
      const media = `m${posts.length + 1}`;
      posts.push({ text: c.text, replyTo: c.replyTo, container: body.creation_id, media });
      return new Response(JSON.stringify({ id: media }), { status: 200 });
    }
    if (method === "GET" && url.includes("fields=status")) {
      return new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { impl, posts };
}

describe("publish.tick", () => {
  it("is a dry run unless PUBLISH_DRY_RUN is exactly 0: nothing is claimed or posted", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "Hello");
    const slot = await insertSlot(t, draft, Date.now() - MIN);
    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ dryRun: true, claimed: 0, published: 0 });
    expect(fake.impl).not.toHaveBeenCalled();
    expect((await t.run(async (ctx) => ctx.db.get(slot)))?.status).toBe("scheduled");
  });

  it("publishes a thread: the first post is the slot, the rest are replies chained in order", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "One\n---\nTwo\n---\nThree");
    const slot = await insertSlot(t, draft, Date.now() - MIN);

    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ dryRun: false, claimed: 1, published: 1, failed: 0 });
    expect(fake.posts.map((p) => [p.text, p.replyTo])).toEqual([
      ["One", null],
      ["Two", "m1"],
      ["Three", "m2"],
    ]);
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row).toMatchObject({ status: "published", publishedPlatformId: "m1" });
    expect(row?.publishedAt).toBeTypeOf("number");
    const receipts = await t.run(async (ctx) => ctx.db.query("publishReceipts").collect());
    expect(receipts.map((r) => r.outcome)).toEqual(["success", "success"]);
    expect(receipts[1].providerMessage).toBe("Published 3 posts as a thread.");
    expect((await t.run(async (ctx) => ctx.db.get(topic)))?.status).toBe("done");
  });

  it("a failed reply never re-posts the thread: the slot stays published with a note", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads({ failReplyAt: 2 });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "One\n---\nTwo\n---\nThree");
    const slot = await insertSlot(t, draft, Date.now() - MIN);

    await t.action(internal.publish.tick, {});
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("published");
    expect(row?.lastError).toMatch(/Post 2 of 3 did not publish/);
    expect(fake.posts.map((p) => p.text)).toEqual(["One"]);
    // A second tick has nothing to do for this slot.
    expect(await t.action(internal.publish.tick, {})).toMatchObject({ claimed: 0 });
    expect(fake.posts).toHaveLength(1);
  });

  it("fails a claim that has been stuck too long instead of retrying it blind", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    vi.stubGlobal("fetch", fakeThreads().impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "Stuck");
    const slot = await insertSlot(t, draft, Date.now() - 2 * 3600_000, { status: "claimed" });
    await t.run(async (ctx) => ctx.db.patch(slot, { claimedAt: Date.now() - 30 * MIN }));

    await t.action(internal.publish.tick, {});
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/Check the account before retrying/);
    const receipts = await t.run(async (ctx) => ctx.db.query("publishReceipts").collect());
    expect(receipts).toHaveLength(1);
    expect(receipts[0].outcome).toBe("permanent");
  });

  it("leaves a recent claim alone", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    vi.stubGlobal("fetch", fakeThreads().impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, Date.now() - 10 * MIN, { status: "claimed" });
    await t.run(async (ctx) => ctx.db.patch(slot, { claimedAt: Date.now() - 2 * MIN }));
    await t.action(internal.publish.tick, {});
    expect((await t.run(async (ctx) => ctx.db.get(slot)))?.status).toBe("claimed");
  });

  it("defers at the daily limit without using up an attempt and keeps the chosen time", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connectThreads(t);
    const topic = await insertTopic(t);
    const old = await insertDraft(t, topic, "threads", "old", "k0");
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        const s = await ctx.db.insert("slots", {
          platform: "threads",
          draftId: old,
          scheduledAt: Date.now() - 3600_000,
          status: "published",
          attempts: 1,
          createdAt: Date.now(),
        });
        await ctx.db.insert("publishReceipts", { slotId: s, attemptedAt: Date.now() - 1800_000, outcome: "success" });
      }
    });
    const draft = await insertDraft(t, topic, "threads", "due", "k1");
    const scheduledAt = Date.now() - MIN;
    const slot = await insertSlot(t, draft, scheduledAt, { attempts: 2 });

    const out = await t.action(internal.publish.tick, {});
    expect(out).toMatchObject({ claimed: 1, published: 0, limited: 1 });
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row).toMatchObject({ status: "scheduled", attempts: 2, originalScheduledAt: scheduledAt });
    expect(row!.scheduledAt).toBeGreaterThan(Date.now() + 50 * MIN);
    expect(fake.posts).toHaveLength(0);
  });
});
