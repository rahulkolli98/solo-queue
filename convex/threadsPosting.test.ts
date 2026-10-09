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

async function connect(t: TestConvex) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "threads",
      platformUserId: "u1",
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

/** An Instagram carousel draft with `n` slides and `n` verified PNGs attached. */
async function carousel(t: TestConvex, n = 3, over: { topic?: Id<"topics">; caption?: string } = {}) {
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
      charCount: 10,
      constraintOk: true,
      createdAt: Date.now(),
    })
  );
  return { topic, draft, assets };
}

const THREAD = "First post: the caption.\n---\nSecond post.\n---\nThird post.";

/** A thread on the topic, optionally with a carousel on its first post. */
async function thread(t: TestConvex, topic: Id<"topics">, over: { body?: string; carousel?: Id<"drafts">; media?: Id<"mediaAssets"> } = {}) {
  const draft = await insertDraft(t, topic, "threads", over.body ?? THREAD, "threads-hook-story");
  if (over.carousel) await t.mutation(api.drafts.setCarousel, { id: draft, carouselDraftId: over.carousel });
  if (over.media) await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: over.media });
  return draft;
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

describe("a carousel on the first post of a thread", () => {
  it("is chosen with setCarousel, taken off with null, and the images stay on the carousel", async () => {
    const t = newTest();
    const { topic, draft: car, assets } = await carousel(t);
    const th = await thread(t, topic);
    await t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: car });
    const on = await t.run((ctx) => ctx.db.get(th));
    expect(on?.carouselDraftId).toBe(car);
    expect((await t.run((ctx) => ctx.db.get(car)))?.mediaAssetIds).toEqual(assets);
    await t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: null });
    expect((await t.run((ctx) => ctx.db.get(th)))?.carouselDraftId).toBeUndefined();
  });

  it("refuses what makes no sense, with a plain code", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t);
    const th = await thread(t, topic);
    const caption = await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats");
    await expect(t.mutation(api.drafts.setCarousel, { id: caption, carouselDraftId: car })).rejects.toThrow(/NOT_A_THREAD/);
    await expect(t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: caption })).rejects.toThrow(/NOT_A_CAROUSEL/);
    const other = await carousel(t);
    await expect(t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: other.draft })).rejects.toThrow(/WRONG_TOPIC/);
    await t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: car });
    await t.mutation(api.slots.enqueue, { draftId: th });
    await expect(t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: null })).rejects.toThrow(/THREAD_QUEUED/);
  });

  it("a photo or video and a carousel are alternatives: attaching one removes the other", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t);
    const th = await thread(t, topic);
    const photo = await assetOf(t, 9, { mimeType: "image/jpeg", ext: "jpg" });
    await t.mutation(api.drafts.attachMedia, { id: th, mediaAssetId: photo });
    await t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: car });
    let row = await t.run((ctx) => ctx.db.get(th));
    expect(row?.carouselDraftId).toBe(car);
    expect(row?.mediaAssetId).toBeUndefined();
    await t.mutation(api.drafts.attachMedia, { id: th, mediaAssetId: photo });
    row = await t.run((ctx) => ctx.db.get(th));
    expect(row?.mediaAssetId).toBe(photo);
    expect(row?.carouselDraftId).toBeUndefined();
    // Detaching the photo does not touch a carousel chosen afterwards.
    await t.mutation(api.drafts.setCarousel, { id: th, carouselDraftId: car });
    await t.mutation(api.drafts.attachMedia, { id: th, mediaAssetId: null });
    expect((await t.run((ctx) => ctx.db.get(th)))?.carouselDraftId).toBe(car);
  });

  it("queues as ONE Threads slot for the thread, and the Instagram carousel is its own separate slot", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t, 4);
    const th = await thread(t, topic, { carousel: car });
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: ["threads-hook-story", "carousel-slides"] });
    expect(out.queued.map((q) => q.templateKey).sort()).toEqual(["carousel-slides", "threads-hook-story"]);
    const slots = await t.run((ctx) => ctx.db.query("slots").collect());
    expect(slots.map((s) => [s.platform, s.draftId]).sort()).toEqual([["instagram", car], ["threads", th]].sort());
  });

  it("the Queue shows the slide count and every image for the thread's post", async () => {
    const t = newTest();
    const { topic, draft: car, assets } = await carousel(t, 3);
    const th = await thread(t, topic, { carousel: car });
    const { slotId } = await t.mutation(api.slots.enqueue, { draftId: th });
    const detail = await t.query(api.queueBoard.detail, { id: slotId });
    expect(detail?.slideMedia.map((m) => m._id)).toEqual(assets);
    expect(detail?.draft?.slideCount).toBe(3);
    expect(detail?.draft?.body).toBe(THREAD);
    const board = await t.query(api.queueBoard.dayColumns, { from: Date.now() - 86_400_000, days: 14, tz: "UTC" });
    const card = board.days.flatMap((d) => [...d.threads, ...d.instagram]).find((c) => c._id === slotId);
    expect(card).toMatchObject({ slideCount: 3, hasMedia: true, draftId: th });
  });

  it("refuses with what to do: no images drawn, too few, unchecked, stale, removed, wrong type, carousel gone", async () => {
    const t = newTest();
    const none = await carousel(t, 3);
    await t.run(async (ctx) => ctx.db.patch(none.draft, { mediaAssetIds: undefined, mediaAssetId: undefined }));
    await expect(t.mutation(api.slots.enqueue, { draftId: await thread(t, none.topic, { carousel: none.draft }) })).rejects.toThrow(/MEDIA_REQUIRED: Draw the slides first/);

    const unchecked = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(unchecked.assets[1], { verifiedAt: undefined }));
    await expect(t.mutation(api.slots.enqueue, { draftId: await thread(t, unchecked.topic, { carousel: unchecked.draft }) })).rejects.toThrow(/MEDIA_UNVERIFIED/);

    const stale = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(stale.assets[0], { verifiedAt: Date.now() - VERIFIED_TTL_MS - 60_000 }));
    await expect(t.mutation(api.slots.enqueue, { draftId: await thread(t, stale.topic, { carousel: stale.draft }) })).rejects.toThrow(/MEDIA_STALE/);

    const removed = await carousel(t, 2);
    await t.run(async (ctx) => ctx.db.patch(removed.assets[0], { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.slots.enqueue, { draftId: await thread(t, removed.topic, { carousel: removed.draft }) })).rejects.toThrow(/MEDIA_REMOVED/);

    const gone = await carousel(t, 2);
    const th = await thread(t, gone.topic, { carousel: gone.draft });
    await t.run(async (ctx) => ctx.db.delete(gone.draft));
    await expect(t.mutation(api.slots.enqueue, { draftId: th })).rejects.toThrow(/CAROUSEL_GONE/);
  });

  it("the thread's own rules still apply: over 500 on a post, a placeholder", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t, 2);
    const long = await thread(t, topic, { carousel: car, body: `${"x".repeat(501)}\n---\nSecond` });
    await t.run(async (ctx) => ctx.db.patch(long, { constraintOk: false }));
    await expect(t.mutation(api.slots.enqueue, { draftId: long })).rejects.toThrow(/OVER_LIMIT/);
    const open = await thread(t, topic, { carousel: car, body: "Text with [[a number]]\n---\nSecond" });
    await expect(t.mutation(api.slots.enqueue, { draftId: open })).rejects.toThrow(/PLACEHOLDER/);
  });

  it("deleting the carousel takes it off the first post; regenerating it elsewhere is covered by the drafting tests", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t);
    const th = await thread(t, topic, { carousel: car });
    await t.mutation(api.drafts.remove, { id: car });
    expect((await t.run((ctx) => ctx.db.get(th)))?.carouselDraftId).toBeUndefined();
  });

  it("the carousel's slides and theme cannot change while the thread that carries it is queued", async () => {
    const t = newTest();
    const { topic, draft: car } = await carousel(t, 2);
    const th = await thread(t, topic, { carousel: car });
    await t.mutation(api.slots.enqueue, { draftId: th });
    await expect(t.mutation(api.drafts.updateSlides, { id: car, slides: [slide(0), slide(1)] })).rejects.toThrow(/CAROUSEL_QUEUED.*first post of a thread/);
    await expect(t.mutation(api.drafts.setTheme, { id: car, theme: "kraft-zine" })).rejects.toThrow(/CAROUSEL_QUEUED/);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id: car, mediaAssetIds: [] })).rejects.toThrow(/CAROUSEL_QUEUED/);
  });
});

describe("a thread with a carousel through the publisher tick", () => {
  it("posts the carousel as the first post with the thread's first post as its text, then the rest as text replies", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { topic, draft: car } = await carousel(t, 3);
    const th = await thread(t, topic, { carousel: car });
    const slot = await insertSlot(t, th, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates.slice(0, 3).map((c) => c.image_url)).toEqual([url(1), url(2), url(3)]);
    expect(fake.creates[3]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2,c3", text: "First post: the caption." });
    const replies = fake.creates.slice(4);
    expect(replies.map((r) => [r.media_type, r.text])).toEqual([
      ["TEXT", "Second post."],
      ["TEXT", "Third post."],
    ]);
    expect(replies.every((r) => Boolean(r.reply_to_id) && r.image_url === undefined)).toBe(true);
    expect(replies[0].reply_to_id).toBe("post-1");
    // The Instagram caption never reaches Threads.
    expect(JSON.stringify(fake.creates)).not.toContain("The Instagram caption");
  });

  it("a one-slide carousel goes out as an ordinary image on the first post", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { topic, draft: car } = await carousel(t, 1);
    const th = await thread(t, topic, { carousel: car, body: "Only post." });
    const slot = await insertSlot(t, th, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates).toHaveLength(1);
    expect(fake.creates[0]).toMatchObject({ media_type: "IMAGE", image_url: url(1), text: "Only post." });
  });

  it("fails for good, saying so, when a slide image has gone missing or the carousel was deleted", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const a = await carousel(t, 3);
    const thA = await thread(t, a.topic, { carousel: a.draft });
    await t.run(async (ctx) => ctx.db.patch(a.assets[1], { fileDeletedAt: Date.now() }));
    const slotA = await insertSlot(t, thA, Date.now() - 5 * 60_000, { platform: "threads" });
    const b = await carousel(t, 2);
    const thB = await thread(t, b.topic, { carousel: b.draft });
    await t.run(async (ctx) => ctx.db.delete(b.draft));
    const slotB = await insertSlot(t, thB, Date.now() - 4 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const rowA = await t.run((ctx) => ctx.db.get(slotA));
    expect(rowA?.status).toBe("failed");
    expect(rowA?.lastError).toMatch(/slide image is gone/i);
    const rowB = await t.run((ctx) => ctx.db.get(slotB));
    expect(rowB?.status).toBe("failed");
    expect(rowB?.lastError).toMatch(/carousel on this thread's first post is gone/);
    expect(fake.creates).toHaveLength(0);
  });

  it("keeps the parent container id when the publish does not go through, so the next tick resumes it", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads({ publishFails: true });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const { topic, draft: car } = await carousel(t, 2);
    const th = await thread(t, topic, { carousel: car });
    const slot = await insertSlot(t, th, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("scheduled");
    expect(row?.containerId).toBe("c3");
  });
});

describe("an image or video on a thread", () => {
  it("is optional: a thread with no media still queues exactly as before", async () => {
    const t = newTest();
    const th = await thread(t, await insertTopic(t));
    await expect(t.mutation(api.slots.enqueue, { draftId: th })).resolves.toBeTruthy();
  });

  it("queues with a checked image or video, and refuses one that is unchecked, stale, gone or a type Threads cannot take", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const ok = await thread(t, topic, { media: await assetOf(t, 1) });
    await expect(t.mutation(api.slots.enqueue, { draftId: ok })).resolves.toBeTruthy();
    const video = await thread(t, topic, { media: await assetOf(t, 2, { mimeType: "video/mp4", ext: "mp4" }) });
    await expect(t.mutation(api.slots.enqueue, { draftId: video })).resolves.toBeTruthy();

    const unchecked = await thread(t, topic, { media: await assetOf(t, 3, { verifiedAt: null }) });
    await expect(t.mutation(api.slots.enqueue, { draftId: unchecked })).rejects.toThrow(/MEDIA_UNVERIFIED/);
    const stale = await thread(t, topic, { media: await assetOf(t, 4, { verifiedAt: Date.now() - VERIFIED_TTL_MS - 60_000 }) });
    await expect(t.mutation(api.slots.enqueue, { draftId: stale })).rejects.toThrow(/MEDIA_STALE/);
    const gif = await thread(t, topic, { media: await assetOf(t, 5, { mimeType: "image/gif", ext: "gif" }) });
    await expect(t.mutation(api.slots.enqueue, { draftId: gif })).rejects.toThrow(/MEDIA_TYPE/);
    const removedAsset = await assetOf(t, 6);
    const removed = await thread(t, topic, { media: removedAsset });
    await t.run(async (ctx) => ctx.db.patch(removedAsset, { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.slots.enqueue, { draftId: removed })).rejects.toThrow(/MEDIA_REMOVED/);
  });

  it("posts the media with the first post only; the replies stay text", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    const fake = fakeThreads();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    await connect(t);
    const th = await thread(t, await insertTopic(t), { media: await assetOf(t, 1, { mimeType: "image/jpeg", ext: "jpg" }) });
    const slot = await insertSlot(t, th, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    expect((await t.run((ctx) => ctx.db.get(slot)))?.status).toBe("published");
    expect(fake.creates[0]).toMatchObject({ media_type: "IMAGE", image_url: url(1, "jpg"), text: "First post: the caption." });
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
    const topic = await insertTopic(t);
    const video = await thread(t, topic, { media: await assetOf(t, 1, { mimeType: "video/mp4", ext: "mp4" }), body: "Only post." });
    await insertSlot(t, video, Date.now() - 5 * 60_000, { platform: "threads" });
    const plain = await thread(t, topic, { body: "Plain post." });
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
    const th = await thread(t, await insertTopic(t), { media: asset });
    await t.run(async (ctx) => ctx.db.patch(asset, { fileDeletedAt: Date.now() }));
    const slot = await insertSlot(t, th, Date.now() - 5 * 60_000, { platform: "threads" });

    await t.action(internal.publish.tick, {});

    const row = await t.run((ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/Attached media is gone/);
    expect(fake.creates).toHaveLength(0);
  });
});
