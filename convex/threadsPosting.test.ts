import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Slide } from "./lib/carouselSlides";
import { VERIFIED_TTL_MS } from "./lib/slots";
import { insertDraft, insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const TH = "https://graph.threads.com/v1.0";
const url = (i: number, ext = "png") => `https://files.example.test/file-${i}.${ext}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const slide = (i: number): Slide => ({ layout: i === 0 ? "cover" : "cards", tone: "cream", headline: `Slide ${i + 1}` });

async function connect(t: TestConvex, platform: "threads" | "instagram" = "threads") {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform,
      platformUserId: platform === "threads" ? "u1" : "ig1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: Date.now() + 40 * 86_400_000,
      scopes: [],
      status: "healthy",
      lastCheckedAt: Date.now(),
    })
  );
}

async function assetOf(t: TestConvex, i: number, over: { mimeType?: string; verifiedAt?: number | null; ext?: string } = {}) {
  return await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: `external:${url(i, over.ext)}`,
      publicUrl: url(i, over.ext),
      mimeType: over.mimeType ?? "image/png",
      verifiedAt: over.verifiedAt === null ? undefined : (over.verifiedAt ?? Date.now()),
      createdAt: Date.now(),
    })
  );
}

/** A carousel draft (Instagram caption, `n` slides, `n` verified PNGs) that also goes to Threads unless `threadsText` is undefined. */
async function carousel(t: TestConvex, n = 3, over: { threadsText?: string | null; caption?: string; topic?: Id<"topics"> } = {}) {
  const topic = over.topic ?? (await insertTopic(t, "A topic"));
  const assets: Id<"mediaAssets">[] = [];
  for (let i = 0; i < n; i += 1) assets.push(await assetOf(t, i + 1));
  const draft = await t.run(async (ctx) =>
    ctx.db.insert("drafts", {
      topicId: topic,
      platform: "instagram",
      body: over.caption ?? "The Instagram caption.",
      templateKey: "carousel-slides",
      templateVersion: 1,
      format: "carousel",
      slides: Array.from({ length: n }, (_, i) => slide(i)),
      mediaAssetIds: assets,
      mediaAssetId: assets[0],
      threadsText: over.threadsText === null ? undefined : (over.threadsText ?? "The Threads text."),
      charCount: 10,
      constraintOk: true,
      createdAt: Date.now(),
    })
  );
  return { topic, draft, assets };
}

/** A fake Threads: children get c1, c2 ...; the parent (or a single post) gets the next id; records what was created. */
function fakeThreads(opts: { publishFails?: boolean } = {}) {
  const creates: Record<string, string>[] = [];
  const published: string[] = [];
  let n = 0;
  const impl = vi.fn(async (u: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (u.startsWith("https://files.example.test/")) return new Response(null, { status: 200 });
    if (method === "POST" && u === `${TH}/u1/threads`) {
      n += 1;
      creates.push(JSON.parse(String(init?.body)) as Record<string, string>);
      return new Response(JSON.stringify({ id: `c${n}` }), { status: 200 });
    }
    if (method === "GET" && u.includes("fields=status")) return new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 });
    if (method === "POST" && u === `${TH}/u1/threads_publish`) {
      if (opts.publishFails) return new Response(JSON.stringify({ error: { message: "Try again later" } }), { status: 500 });
      published.push(JSON.parse(String(init?.body)).creation_id);
      return new Response(JSON.stringify({ id: `post-${published.length}` }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  });
  return { impl, creates, published };
}

describe("queueing a carousel on Threads", () => {
  it("queues a carousel with a Threads text on Threads, and its Instagram post is a separate slot", async () => {
    const t = newTest();
    const { draft } = await carousel(t);
    const th = await t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" });
    const ig = await t.mutation(api.slots.enqueue, { draftId: draft });
    const slots = await t.run((ctx) => ctx.db.query("slots").collect());
    expect(slots.map((s) => [s._id, s.platform, s.draftId])).toEqual([
      [th.slotId, "threads", draft],
      [ig.slotId, "instagram", draft],
    ]);
  });

  it("refuses a second Threads post of the same carousel, but not its first Instagram post", async () => {
    const t = newTest();
    const { draft } = await carousel(t);
    await t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" });
    await expect(t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" })).rejects.toThrow(/ALREADY_QUEUED/);
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).resolves.toBeTruthy();
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).rejects.toThrow(/ALREADY_QUEUED/);
  });

  it("refuses with what to do: no Threads text set up, over 500, a placeholder, not a carousel, no images", async () => {
    const t = newTest();
    const none = await carousel(t, 2, { threadsText: null });
    await expect(t.mutation(api.slots.enqueue, { draftId: none.draft, platform: "threads" })).rejects.toThrow(/NO_THREADS_TEXT/);

    const long = await carousel(t, 2, { threadsText: "x".repeat(501) });
    await expect(t.mutation(api.slots.enqueue, { draftId: long.draft, platform: "threads" })).rejects.toThrow(/OVER_LIMIT.*500/);

    const open = await carousel(t, 2, { threadsText: "Text with [[a number]]" });
    await expect(t.mutation(api.slots.enqueue, { draftId: open.draft, platform: "threads" })).rejects.toThrow(/PLACEHOLDER/);

    const caption = await insertDraft(t, await insertTopic(t), "instagram", "A caption", "ig-caption-beats");
    await expect(t.mutation(api.slots.enqueue, { draftId: caption, platform: "threads" })).rejects.toThrow(/PLATFORM_MISMATCH/);

    const noImages = await carousel(t, 3);
    await t.run(async (ctx) => ctx.db.patch(noImages.draft, { mediaAssetIds: undefined, mediaAssetId: undefined }));
    await expect(t.mutation(api.slots.enqueue, { draftId: noImages.draft, platform: "threads" })).rejects.toThrow(/MEDIA_REQUIRED: Draw the slides first/);

    const stale = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(stale.assets[0], { verifiedAt: Date.now() - VERIFIED_TTL_MS - 60_000 }));
    await expect(t.mutation(api.slots.enqueue, { draftId: stale.draft, platform: "threads" })).rejects.toThrow(/MEDIA_STALE/);
  });

  it("allows a carousel on Threads with no text at all (Threads accepts one)", async () => {
    const t = newTest();
    const { draft } = await carousel(t, 2, { threadsText: "" });
    await expect(t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" })).resolves.toBeTruthy();
  });

  it("'Queue this week' puts the carousel on each platform at that platform's own next free slot", async () => {
    const t = newTest();
    const { topic } = await carousel(t, 3);
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC" });
    expect(out.queued.map((q) => q.templateKey).sort()).toEqual(["carousel-slides", "carousel-slides@threads"]);
    expect(out.queued.map((q) => q.format).sort()).toEqual(["IG carousel", "Threads carousel"]);
    const slots = await t.run((ctx) => ctx.db.query("slots").collect());
    expect(slots.map((s) => s.platform).sort()).toEqual(["instagram", "threads"]);
    // Each platform plans its own time, so the two posts need not be at the same minute.
    expect(slots.every((s) => s.scheduledAt > Date.now())).toBe(true);
    // Run again: both are already queued, and each says so.
    const again = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: ["carousel-slides", "carousel-slides@threads"] });
    expect(again.queued).toEqual([]);
    expect(again.skipped.map((s) => [s.templateKey, s.code]).sort()).toEqual([
      ["carousel-slides", "ALREADY_QUEUED"],
      ["carousel-slides@threads", "ALREADY_QUEUED"],
    ]);
  });

  it("queues only the platform that was picked, and leaves Threads out for a carousel that is not going there", async () => {
    const t = newTest();
    const { topic } = await carousel(t, 2);
    const onlyThreads = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: ["carousel-slides@threads"] });
    expect(onlyThreads.queued.map((q) => q.templateKey)).toEqual(["carousel-slides@threads"]);
    expect(onlyThreads.skipped).toEqual([]);

    const plain = await carousel(t, 2, { threadsText: null });
    const out = await t.mutation(api.slots.queueTopic, { topicId: plain.topic, tz: "UTC" });
    expect([...out.queued, ...out.skipped].some((x) => x.templateKey === "carousel-slides@threads")).toBe(false);
  });

  it("the Queue and Published show the Threads text for a Threads slot and the caption for an Instagram slot", async () => {
    const t = newTest();
    const { draft } = await carousel(t, 2, { caption: "Caption for Instagram", threadsText: "Words for Threads" });
    const th = await t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" });
    const ig = await t.mutation(api.slots.enqueue, { draftId: draft });
    const thDetail = await t.query(api.queueBoard.detail, { id: th.slotId });
    const igDetail = await t.query(api.queueBoard.detail, { id: ig.slotId });
    expect(thDetail?.draft?.body).toBe("Words for Threads");
    expect(igDetail?.draft?.body).toBe("Caption for Instagram");
    await t.run(async (ctx) => {
      await ctx.db.patch(th.slotId, { status: "published", publishedAt: Date.now() - 1000 });
    });
    const published = await t.query(api.library.published, { now: Date.now() });
    expect(published.find((p) => p.slotId === th.slotId)?.body).toBe("Words for Threads");
  });
});

describe("a Threads carousel through the publisher tick", () => {
  it("posts every slide image as a child, then one parent with the Threads text (not the caption), and marks the slot published", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 3, { caption: "Caption for Instagram", threadsText: "Words for Threads" });
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates.slice(0, 3).map((c) => c.image_url)).toEqual([url(1), url(2), url(3)]);
    expect(fake.creates[3]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2,c3", text: "Words for Threads" });
    expect(JSON.stringify(fake.creates)).not.toContain("Caption for Instagram");
    expect(fake.published).toEqual(["c4"]);
  });

  it("a one-slide carousel goes out as an ordinary image post", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 1);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]).toMatchObject({ media_type: "IMAGE", image_url: url(1), text: "The Threads text." });
  });

  it("fails for good, saying so, when a slide image has gone missing", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft, assets } = await carousel(t, 3);
    await t.run(async (ctx) => ctx.db.patch(assets[1], { fileDeletedAt: Date.now() }));
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/slide image is gone/i);
    expect(fake.creates).toHaveLength(0);
  });

  it("keeps the parent container id when the publish does not go through, so the next tick resumes it", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads({ publishFails: true });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { draft } = await carousel(t, 2);
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("scheduled");
    expect(row?.containerId).toBe("c3");
  });
});

describe("an image or video on a thread", () => {
  async function thread(t: TestConvex, media?: Id<"mediaAssets">, body = "First post.\n---\nSecond post.\n---\nThird post.") {
    const draft = await insertDraft(t, await insertTopic(t), "threads", body, "threads-hook-story");
    if (media) await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: media });
    return draft;
  }

  it("is optional: a thread with no media still queues exactly as before", async () => {
    const t = newTest();
    const draft = await thread(t);
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).resolves.toBeTruthy();
  });

  it("queues with a checked image or video, and refuses one that is unchecked, stale, gone or a type Threads cannot take", async () => {
    const t = newTest();
    const ok = await thread(t, await assetOf(t, 1));
    await expect(t.mutation(api.slots.enqueue, { draftId: ok })).resolves.toBeTruthy();
    const video = await thread(t, await assetOf(t, 2, { mimeType: "video/mp4", ext: "mp4" }));
    await expect(t.mutation(api.slots.enqueue, { draftId: video })).resolves.toBeTruthy();

    const unchecked = await thread(t, await assetOf(t, 3, { verifiedAt: null }));
    await expect(t.mutation(api.slots.enqueue, { draftId: unchecked })).rejects.toThrow(/MEDIA_UNVERIFIED/);
    const stale = await thread(t, await assetOf(t, 4, { verifiedAt: Date.now() - VERIFIED_TTL_MS - 60_000 }));
    await expect(t.mutation(api.slots.enqueue, { draftId: stale })).rejects.toThrow(/MEDIA_STALE/);
    const gif = await thread(t, await assetOf(t, 5, { mimeType: "image/gif", ext: "gif" }));
    await expect(t.mutation(api.slots.enqueue, { draftId: gif })).rejects.toThrow(/MEDIA_TYPE/);
    const removedAsset = await assetOf(t, 6);
    const removed = await thread(t, removedAsset);
    await t.run(async (ctx) => ctx.db.patch(removedAsset, { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.slots.enqueue, { draftId: removed })).rejects.toThrow(/MEDIA_REMOVED/);
  });

  it("posts the media with the first post only; the replies stay text", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const draft = await thread(t, await assetOf(t, 1, { mimeType: "image/jpeg", ext: "jpg" }));
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates[0]).toMatchObject({ media_type: "IMAGE", image_url: url(1, "jpg"), text: "First post." });
    const replies = fake.creates.slice(1);
    expect(replies).toHaveLength(2);
    expect(replies.every((r) => r.media_type === "TEXT" && r.image_url === undefined && r.reply_to_id)).toBe(true);
    expect(replies.map((r) => r.text)).toEqual(["Second post.", "Third post."]);
  });

  it("posts a video as a VIDEO container, and a thread without media as plain text", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const video = await thread(t, await assetOf(t, 1, { mimeType: "video/mp4", ext: "mp4" }), "Only post.");
    await insertSlot(t, video, Date.now() - 5 * 60_000, { platform: "threads" });
    const plain = await thread(t, undefined, "Plain post.");
    await insertSlot(t, plain, Date.now() - 4 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect(fake.creates[0]).toMatchObject({ media_type: "VIDEO", video_url: url(1, "mp4") });
    expect(fake.creates[1]).toMatchObject({ media_type: "TEXT", text: "Plain post." });
    expect(fake.creates[1].image_url).toBeUndefined();
  });

  it("fails for good, saying what to do, when the attached file is gone by posting time", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const asset = await assetOf(t, 1);
    const draft = await thread(t, asset);
    await t.run(async (ctx) => ctx.db.patch(asset, { fileDeletedAt: Date.now() }));
    const slot = await insertSlot(t, draft, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/Attached media is gone/);
    expect(fake.creates).toHaveLength(0);
  });
});

describe("drafts.setThreadsText", () => {
  it("sets, replaces and clears a carousel's Threads text", async () => {
    const t = newTest();
    const { draft } = await carousel(t, 2, { threadsText: null });
    await t.mutation(api.drafts.setThreadsText, { id: draft, text: "Hello Threads" });
    expect((await t.run((ctx) => ctx.db.get(draft)))?.threadsText).toBe("Hello Threads");
    await t.mutation(api.drafts.setThreadsText, { id: draft, text: "" });
    expect((await t.run((ctx) => ctx.db.get(draft)))?.threadsText).toBe("");
    await t.mutation(api.drafts.setThreadsText, { id: draft, text: null });
    expect((await t.run((ctx) => ctx.db.get(draft)))?.threadsText).toBeUndefined();
  });

  it("refuses a draft that is not a carousel, and taking a carousel off Threads while it has a Threads post", async () => {
    const t = newTest();
    const plain = await insertDraft(t, await insertTopic(t), "instagram", "Caption", "ig-caption-beats");
    await expect(t.mutation(api.drafts.setThreadsText, { id: plain, text: "x" })).rejects.toThrow(/NOT_A_CAROUSEL/);

    const { draft } = await carousel(t, 2);
    await t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" });
    await expect(t.mutation(api.drafts.setThreadsText, { id: draft, text: null })).rejects.toThrow(/THREADS_QUEUED/);
    // The text can still be edited, and an Instagram-only post does not block taking it off Threads.
    await t.mutation(api.drafts.setThreadsText, { id: draft, text: "New words" });
    const other = await carousel(t, 2);
    await t.mutation(api.slots.enqueue, { draftId: other.draft });
    await expect(t.mutation(api.drafts.setThreadsText, { id: other.draft, text: null })).resolves.toBeNull();
  });

  it("changing the slides is refused while either platform has a post (one set of images, so both are protected)", async () => {
    const t = newTest();
    const { draft } = await carousel(t, 2);
    await t.mutation(api.slots.enqueue, { draftId: draft, platform: "threads" });
    await expect(t.mutation(api.drafts.updateSlides, { id: draft, slides: [slide(0), slide(1)] })).rejects.toThrow(/CAROUSEL_QUEUED/);
    await expect(t.mutation(api.drafts.setTheme, { id: draft, theme: "kraft-zine" })).rejects.toThrow(/CAROUSEL_QUEUED/);
  });
});

describe("createOwnCarousel for Threads", () => {
  it("stores the Threads text with the carousel when one is given", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const assets = [await assetOf(t, 1), await assetOf(t, 2)];
    const id = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "Caption", mediaAssetIds: assets, threadsText: "For Threads" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.threadsText).toBe("For Threads");
    const plain = await t.mutation(api.drafts.createOwnCarousel, { topicId: await insertTopic(t), caption: "Caption", mediaAssetIds: assets });
    expect((await t.run((ctx) => ctx.db.get(plain)))?.threadsText).toBeUndefined();
  });
});
