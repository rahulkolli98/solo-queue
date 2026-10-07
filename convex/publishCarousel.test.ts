import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Slide } from "./lib/carouselSlides";
import { VERIFIED_TTL_MS } from "./lib/slots";
import { insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const IG = "https://graph.instagram.com/v26.0";
const url = (i: number) => `https://files.example.test/slide-${i}.png`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const slide = (i: number): Slide => ({ layout: i === 0 ? "cover" : "cards", tone: "cream", headline: `Slide ${i + 1}` });

async function connect(t: TestConvex) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "instagram",
      platformUserId: "ig1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: Date.now() + 40 * 86_400_000,
      scopes: [],
      status: "healthy",
      lastCheckedAt: Date.now(),
    })
  );
}

/** A carousel draft with `n` slides and (unless told otherwise) `n` verified PNG images attached. */
async function carousel(t: TestConvex, n: number, over: { images?: number; verifiedAt?: number; mimeType?: string; caption?: string } = {}) {
  const topic = await insertTopic(t, "A topic");
  const draft = await t.run(async (ctx) =>
    ctx.db.insert("drafts", {
      topicId: topic,
      platform: "instagram",
      body: over.caption ?? "The carousel caption.",
      templateKey: "carousel-slides",
      templateVersion: 1,
      format: "carousel",
      slides: Array.from({ length: n }, (_, i) => slide(i)),
      charCount: 10,
      constraintOk: true,
      createdAt: Date.now(),
    })
  );
  const assets: Id<"mediaAssets">[] = await t.run(async (ctx) => {
    const ids: Id<"mediaAssets">[] = [];
    for (let i = 0; i < (over.images ?? n); i += 1) {
      ids.push(
        await ctx.db.insert("mediaAssets", {
          storageId: `external:${url(i + 1)}`,
          publicUrl: url(i + 1),
          mimeType: over.mimeType ?? "image/png",
          verifiedAt: over.verifiedAt ?? Date.now(),
          createdAt: Date.now(),
        })
      );
    }
    return ids;
  });
  await t.run(async (ctx) => ctx.db.patch(draft, { mediaAssetIds: assets, mediaAssetId: assets[0] }));
  return { topic, draft, assets };
}

/** A fake Instagram: children get c1, c2 ...; the parent (or a photo) gets the next id; records what was created. */
function fakeInstagram(opts: { rejectChild?: number; publishFails?: boolean } = {}) {
  const creates: Record<string, string>[] = [];
  const published: string[] = [];
  let n = 0;
  const impl = vi.fn(async (u: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (u.startsWith("https://files.example.test/")) return new Response(null, { status: 200 });
    if (method === "GET" && u.startsWith(`${IG}/ig1?fields=id`)) return new Response(JSON.stringify({ id: "ig1" }), { status: 200 });
    if (method === "POST" && u === `${IG}/ig1/media`) {
      n += 1;
      creates.push(JSON.parse(String(init?.body)) as Record<string, string>);
      return new Response(JSON.stringify({ id: `c${n}` }), { status: 200 });
    }
    if (method === "GET" && u.includes("fields=status_code")) {
      const id = /v26\.0\/([^?]+)\?/.exec(u)?.[1] ?? "";
      const bad = opts.rejectChild !== undefined && id === `c${opts.rejectChild}`;
      return new Response(JSON.stringify(bad ? { status_code: "ERROR", status: "Image not supported" } : { status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && u === `${IG}/ig1/media_publish`) {
      if (opts.publishFails) return new Response(JSON.stringify({ error: { message: "Media ID is not available" } }), { status: 400 });
      published.push(JSON.parse(String(init?.body)).creation_id);
      return new Response(JSON.stringify({ id: `post-${published.length}` }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  });
  return { impl, creates, published };
}

describe("a carousel through the publisher tick", () => {
  it("posts every slide image in order as children, then one parent, and marks the slot published", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeInstagram();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 3);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "instagram" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates.slice(0, 3).map((c) => c.image_url)).toEqual([url(1), url(2), url(3)]);
    expect(fake.creates[3]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2,c3", caption: "The carousel caption." });
    expect(fake.published).toEqual(["c4"]);
  });

  it("a one-slide carousel goes out as an ordinary image post", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeInstagram();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 1);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "instagram" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]).toMatchObject({ image_url: url(1), caption: "The carousel caption." });
    expect(fake.creates[0].is_carousel_item).toBeUndefined();
    expect(fake.creates[0].media_type).toBeUndefined();
  });

  it("fails for good, saying which slide, when Instagram will not take one image (for example the PNG)", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeInstagram({ rejectChild: 2 });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 3);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "instagram" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/slide 2.*Image not supported/);
    expect(fake.published).toEqual([]);
    expect(fake.creates.some((c) => c.media_type === "CAROUSEL")).toBe(false);
  });

  it("keeps the parent's container id when the publish of it does not go through, so the next tick resumes it", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    vi.stubEnv("INSTAGRAM_RETRY_DELAYS_MS", "1,1,1");
    const fake = fakeInstagram({ publishFails: true });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 2);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "instagram" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("scheduled");
    expect(row?.containerId).toBe("c3");
  });

  it("fails for good with a clear message when a slide image has gone missing", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeInstagram();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft, assets } = await carousel(t, 3);
    await t.run(async (ctx) => ctx.db.patch(assets[1], { fileDeletedAt: Date.now() }));
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "instagram" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/slide image is gone/i);
    expect(fake.creates).toHaveLength(0);
  });
});

describe("queueing a carousel", () => {
  it("queues one with a fresh image for every slide, using the cover as its media", async () => {
    const t = newTest();
    const { draft } = await carousel(t, 4);
    const out = await t.mutation(api.slots.enqueue, { draftId: draft });
    const slots = await t.run((ctx) => ctx.db.query("slots").collect());
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ _id: out.slotId, platform: "instagram", status: "scheduled", draftId: draft });
  });

  it("refuses with a message that says what to do: no images, too few images, unchecked, stale, removed, wrong type", async () => {
    const t = newTest();
    const none = await carousel(t, 3, { images: 0 });
    await expect(t.mutation(api.slots.enqueue, { draftId: none.draft })).rejects.toThrow(/MEDIA_REQUIRED: Draw the slides first/);

    const few = await carousel(t, 4, { images: 3 });
    await expect(t.mutation(api.slots.enqueue, { draftId: few.draft })).rejects.toThrow(/MEDIA_REQUIRED: This carousel has 4 slides but 3 images/);

    const unchecked = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(unchecked.assets[1], { verifiedAt: undefined }));
    await expect(t.mutation(api.slots.enqueue, { draftId: unchecked.draft })).rejects.toThrow(/MEDIA_UNVERIFIED: The image for slide 2/);

    const stale = await carousel(t, 2, { verifiedAt: Date.now() - VERIFIED_TTL_MS - 60_000 });
    await expect(t.mutation(api.slots.enqueue, { draftId: stale.draft })).rejects.toThrow(/MEDIA_STALE/);

    const removed = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(removed.assets[0], { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.slots.enqueue, { draftId: removed.draft })).rejects.toThrow(/MEDIA_REMOVED/);

    const gif = await carousel(t, 2, { mimeType: "image/gif" });
    await expect(t.mutation(api.slots.enqueue, { draftId: gif.draft })).rejects.toThrow(/SLIDE_IMAGE_TYPE/);
  });

  it("refuses a caption over 2,200 characters, and a placeholder, like any Instagram post", async () => {
    const t = newTest();
    const long = await carousel(t, 2, { caption: "x".repeat(2201) });
    await t.run(async (ctx) => ctx.db.patch(long.draft, { constraintOk: false }));
    await expect(t.mutation(api.slots.enqueue, { draftId: long.draft })).rejects.toThrow(/OVER_LIMIT/);
    const open = await carousel(t, 2, { caption: "Caption with [[your number]]" });
    await expect(t.mutation(api.slots.enqueue, { draftId: open.draft })).rejects.toThrow(/PLACEHOLDER/);
  });

  it("'Queue this week' includes a topic's carousel when it has one, and says nothing about one when it does not", async () => {
    const t = newTest();
    const withCarousel = await carousel(t, 3);
    const out = await t.mutation(api.slots.queueTopic, { topicId: withCarousel.topic });
    expect(out.queued.map((q) => q.format)).toEqual(["IG carousel"]);
    expect(out.skipped.map((s) => s.format)).toEqual(["Threads", "IG caption", "IG reel"]);

    const plain = await insertTopic(t, "No carousel here");
    const none = await t.mutation(api.slots.queueTopic, { topicId: plain });
    expect([...none.queued, ...none.skipped].some((x) => x.format === "IG carousel")).toBe(false);
  });

  it("the Queue shows the slide count and every slide image for a carousel post", async () => {
    const t = newTest();
    const { draft, assets } = await carousel(t, 3);
    const { slotId } = await t.mutation(api.slots.enqueue, { draftId: draft });
    const detail = await t.query(api.queueBoard.detail, { id: slotId });
    expect(detail?.slideMedia.map((m) => m._id)).toEqual(assets);
    const board = await t.query(api.queueBoard.dayColumns, { from: Date.now() - 86_400_000, days: 14, tz: "UTC" });
    const cards = board.days.flatMap((d) => [...d.threads, ...d.instagram]);
    expect(cards.find((c) => c._id === slotId)?.slideCount).toBe(3);
  });

  it("a published carousel can be put back in the queue while its images exist, and not after one is removed", async () => {
    const t = newTest();
    const { draft, assets } = await carousel(t, 2);
    const slot = await insertSlot(t, draft, Date.now() - 40 * 86_400_000, { platform: "instagram", status: "published" });
    await t.run(async (ctx) => ctx.db.patch(slot, { evergreen: true, publishedAt: Date.now() - 40 * 86_400_000 }));
    const again = await t.mutation(api.queueBoard.requeue, { id: slot, tz: "UTC" });
    expect(again.scheduledAt).toBeGreaterThan(Date.now());
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("slots").collect()) if (s.status === "scheduled") await ctx.db.delete(s._id);
      await ctx.db.patch(assets[1], { fileDeletedAt: Date.now() });
    });
    await expect(t.mutation(api.queueBoard.requeue, { id: slot, tz: "UTC" })).rejects.toThrow(/MEDIA_REMOVED/);
  });
});
