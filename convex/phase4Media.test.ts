import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { VERIFIED_TTL_MS } from "./lib/slots";
import { publishInstagramPost } from "./providers/instagram";
import { insertDraft, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

/**
 * TASK-039 (OQ-003, media policy): Convex-hosted media is primary, an external
 * URL is allowed but must be verified before it queues and is probed again by the
 * publisher right before the container is created.
 *
 * These tests assert statuses, codes, counts, times and database state only, never
 * the wording of a message.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const IG = "https://graph.instagram.com/v26.0";
const EXTERNAL_URL = "https://cdn.example.test/photos/cover.png";
// A fixed Monday, 06:00 UTC, so nothing depends on the time of day the suite runs.
const T0 = Date.UTC(2026, 5, 1, 6, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("PUBLISH_DRY_RUN", "0");
  vi.stubEnv("INSTAGRAM_RETRY_DELAYS_MS", "1,1,1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * A fake of the network the publisher and the verifier see: media hosts (any URL that is
 * not Instagram's API; the ones in `down` answer 404) and the Instagram API itself.
 */
function fakeWorld() {
  const down = new Set<string>();
  const calls: { method: string; url: string }[] = [];
  let containers = 0;
  const publishedContainers: string[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (!url.startsWith(IG)) {
      if (down.has(url)) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "content-type": "image/png" } });
    }
    if (method === "GET" && url.startsWith(`${IG}/ig1?fields=id`)) return new Response(JSON.stringify({ id: "ig1" }), { status: 200 });
    if (method === "POST" && url === `${IG}/ig1/media`) {
      containers += 1;
      return new Response(JSON.stringify({ id: `c${containers}` }), { status: 200 });
    }
    if (method === "GET" && url.includes("fields=status_code")) return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    if (method === "POST" && url === `${IG}/ig1/media_publish`) {
      const body = JSON.parse(String(init?.body));
      publishedContainers.push(body.creation_id);
      return new Response(JSON.stringify({ id: `m${publishedContainers.length}` }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return {
    impl,
    down,
    calls,
    publishedContainers,
    containersCreated: () => containers,
    publishCalls: () => publishedContainers.length,
    igCalls: () => calls.filter((c) => c.url.startsWith(IG)),
    probes: (url: string) => calls.filter((c) => c.url === url),
  };
}

async function connectInstagram(t: TestConvex) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "instagram",
      platformUserId: "ig1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: T0 + 90 * 24 * HOUR,
      scopes: [],
      status: "healthy",
      lastCheckedAt: T0,
    })
  );
}

const getAsset = (t: TestConvex, id: Id<"mediaAssets">) => t.run(async (ctx) => ctx.db.get(id));
const getSlot = (t: TestConvex, id: Id<"slots">) => t.run(async (ctx) => ctx.db.get(id));
const receiptsOf = (t: TestConvex, slotId: Id<"slots">) =>
  t.run(async (ctx) => ctx.db.query("publishReceipts").withIndex("by_slot", (q) => q.eq("slotId", slotId)).collect());

async function registerExternal(t: TestConvex, url = EXTERNAL_URL) {
  return await t.mutation(api.media.registerExternal, { url, mimeType: "image/png" });
}

async function igDraftWith(t: TestConvex, assetId: Id<"mediaAssets">, title: string) {
  const topic = await insertTopic(t, title);
  const draft = await insertDraft(t, topic, "instagram", `Caption for ${title}.`, "ig-caption-beats");
  await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: assetId });
  return draft;
}

/**
 * Queue a new Instagram draft that uses `assetId` for 30 minutes from the pinned "now", move the
 * clock 5 minutes past that time and run the real publisher tick once.
 */
async function queueAndPublish(t: TestConvex, assetId: Id<"mediaAssets">, title: string) {
  const draft = await igDraftWith(t, assetId, title);
  const queued = await t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: Date.now() + 30 * MIN });
  vi.setSystemTime(queued.scheduledAt + 5 * MIN);
  const tick = await t.action(internal.publish.tick, {});
  return { draft, slotId: queued.slotId, tick };
}

describe("an external URL: verified, queued, published once", () => {
  it("is refused until verified, then queues, publishes through the real tick, and is not posted twice", async () => {
    const world = fakeWorld();
    vi.stubGlobal("fetch", world.impl);
    const t = newTest();
    await connectInstagram(t);

    const assetId = await registerExternal(t);
    expect(await getAsset(t, assetId)).toMatchObject({ source: "external", publicUrl: EXTERNAL_URL, storageId: `external:${EXTERNAL_URL}` });
    expect((await getAsset(t, assetId))?.verifiedAt).toBeUndefined();

    const draft = await igDraftWith(t, assetId, "External cover");
    await expect(t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: T0 + 30 * MIN })).rejects.toThrow(/VALIDATION:MEDIA_UNVERIFIED:/);

    await t.action(api.media.verify, { id: assetId });
    const verified = await getAsset(t, assetId);
    expect(verified?.verifiedAt).toBe(T0);
    expect(verified?.mimeType).toBe("image/png");
    expect(world.probes(EXTERNAL_URL).map((c) => c.method)).toEqual(["HEAD"]);

    const queued = await t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: T0 + 30 * MIN });
    expect(queued.scheduledAt).toBe(T0 + 30 * MIN);
    expect((await getSlot(t, queued.slotId))?.status).toBe("scheduled");

    vi.setSystemTime(T0 + 35 * MIN);
    const tick = await t.action(internal.publish.tick, {});
    expect(tick).toMatchObject({ dryRun: false, claimed: 1, published: 1, failed: 0 });

    const slot = await getSlot(t, queued.slotId);
    expect(slot?.status).toBe("published");
    expect(slot?.publishedPlatformId).toBe("m1");
    expect(world.containersCreated()).toBe(1);
    expect(world.publishCalls()).toBe(1);
    const receipts = await receiptsOf(t, queued.slotId);
    expect(receipts.map((r) => r.outcome)).toEqual(["success"]);
    // The publisher probed the URL again before creating the container (verify + pre-flight = 2 HEADs).
    expect(world.probes(EXTERNAL_URL).map((c) => c.method)).toEqual(["HEAD", "HEAD"]);

    // Another tick finds nothing due: the post is not published twice.
    expect(await t.action(internal.publish.tick, {})).toMatchObject({ claimed: 0, published: 0 });
    expect(world.publishCalls()).toBe(1);
    expect(await receiptsOf(t, queued.slotId)).toHaveLength(1);
  });

  it("survives a re-verify cycle: verifiedAt moves forward, the asset is unchanged otherwise, and a second slot on the same URL queues and publishes", async () => {
    const world = fakeWorld();
    vi.stubGlobal("fetch", world.impl);
    const t = newTest();
    await connectInstagram(t);
    const assetId = await registerExternal(t);
    await t.action(api.media.verify, { id: assetId });

    const first = await queueAndPublish(t, assetId, "First use");
    expect(first.tick).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    const firstSlot = await getSlot(t, first.slotId);
    expect(firstSlot?.status).toBe("published");
    const beforeReverify = await getAsset(t, assetId);
    expect(beforeReverify?.verifiedAt).toBe(T0);

    // Later, the founder (or a nightly check) verifies the same link again.
    vi.setSystemTime(T0 + 3 * HOUR);
    await t.action(api.media.verify, { id: assetId });
    const afterReverify = await getAsset(t, assetId);
    expect(afterReverify?.verifiedAt).toBe(T0 + 3 * HOUR);
    expect(afterReverify!.verifiedAt!).toBeGreaterThan(beforeReverify!.verifiedAt!);
    expect(afterReverify?.lastVerifyError).toBeUndefined();
    expect(afterReverify).toMatchObject({
      source: "external",
      publicUrl: EXTERNAL_URL,
      storageId: `external:${EXTERNAL_URL}`,
      mimeType: "image/png",
    });

    const second = await queueAndPublish(t, assetId, "Second use");
    expect(second.tick).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect((await getSlot(t, second.slotId))?.status).toBe("published");
    expect(second.draft).not.toBe(first.draft);

    // Two posts, two containers, two publishes, one success receipt each; the first slot was not touched.
    expect(world.containersCreated()).toBe(2);
    expect(world.publishCalls()).toBe(2);
    expect(new Set(world.publishedContainers).size).toBe(2);
    expect((await receiptsOf(t, first.slotId)).map((r) => r.outcome)).toEqual(["success"]);
    expect((await receiptsOf(t, second.slotId)).map((r) => r.outcome)).toEqual(["success"]);
    expect(await getSlot(t, first.slotId)).toEqual(firstSlot);
  });
});

describe("a stale verification", () => {
  it("is refused at queue time (MEDIA_STALE) once older than the TTL, and a re-verify lets the same draft queue", async () => {
    const world = fakeWorld();
    vi.stubGlobal("fetch", world.impl);
    const t = newTest();
    const assetId = await registerExternal(t);
    await t.action(api.media.verify, { id: assetId });
    expect((await getAsset(t, assetId))?.verifiedAt).toBe(T0);

    const atTheLimit = await igDraftWith(t, assetId, "At the limit");
    const justPast = await igDraftWith(t, assetId, "Just past the limit");

    // Exactly the TTL old is still fresh.
    vi.setSystemTime(T0 + VERIFIED_TTL_MS);
    const ok = await t.mutation(api.slots.enqueue, { draftId: atTheLimit, scheduledAt: T0 + VERIFIED_TTL_MS + 2 * HOUR });
    expect((await getSlot(t, ok.slotId))?.status).toBe("scheduled");

    // One millisecond more and it is stale: refused, and nothing was queued for that draft.
    vi.setSystemTime(T0 + VERIFIED_TTL_MS + 1);
    await expect(
      t.mutation(api.slots.enqueue, { draftId: justPast, scheduledAt: T0 + VERIFIED_TTL_MS + 3 * HOUR })
    ).rejects.toThrow(/VALIDATION:MEDIA_STALE:/);
    expect(await t.run(async (ctx) => ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", justPast)).collect())).toEqual([]);

    // Re-verifying makes it fresh again and the same draft now queues.
    await t.action(api.media.verify, { id: assetId });
    expect((await getAsset(t, assetId))?.verifiedAt).toBe(T0 + VERIFIED_TTL_MS + 1);
    const again = await t.mutation(api.slots.enqueue, { draftId: justPast, scheduledAt: T0 + VERIFIED_TTL_MS + 3 * HOUR });
    expect((await getSlot(t, again.slotId))?.status).toBe("scheduled");
  });
});

describe("an external URL that stops being reachable between queueing and publishing", () => {
  it("fails permanently at the pre-flight, posts nothing, and can be recovered by re-verifying and retrying", async () => {
    const world = fakeWorld();
    vi.stubGlobal("fetch", world.impl);
    const t = newTest();
    await connectInstagram(t);
    const assetId = await registerExternal(t);
    await t.action(api.media.verify, { id: assetId });
    const draft = await igDraftWith(t, assetId, "Link that rots");
    const queued = await t.mutation(api.slots.enqueue, { draftId: draft, scheduledAt: T0 + 30 * MIN });

    // The host takes the file down after it was queued (verification is still "fresh").
    world.down.add(EXTERNAL_URL);
    vi.setSystemTime(T0 + 35 * MIN);
    const tick = await t.action(internal.publish.tick, {});
    expect(tick).toMatchObject({ claimed: 1, published: 0, failed: 1 });

    const failed = await getSlot(t, queued.slotId);
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastError).toBeTypeOf("string");
    expect(failed?.containerId).toBeUndefined();
    expect((await receiptsOf(t, queued.slotId)).map((r) => r.outcome)).toEqual(["permanent"]);
    // Nothing was sent to Instagram at all: no identity check, no container, no media_publish.
    expect(world.igCalls()).toEqual([]);
    expect(world.containersCreated()).toBe(0);
    expect(world.publishCalls()).toBe(0);

    // The file comes back. Re-verify, retry, and the very same slot publishes once; the failed attempt stays as history.
    world.down.delete(EXTERNAL_URL);
    await t.action(api.media.verify, { id: assetId });
    const retried = await t.mutation(api.queueBoard.retry, { id: queued.slotId, scheduledAt: Date.now() + 30 * MIN });
    expect(await getSlot(t, queued.slotId)).toMatchObject({ status: "scheduled", attempts: 0 });
    vi.setSystemTime(retried.scheduledAt + 5 * MIN);
    expect(await t.action(internal.publish.tick, {})).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect((await getSlot(t, queued.slotId))?.status).toBe("published");
    expect((await receiptsOf(t, queued.slotId)).map((r) => r.outcome).sort()).toEqual(["permanent", "success"]);
    expect(world.containersCreated()).toBe(1);
    expect(world.publishCalls()).toBe(1);
  });

  it("the provider returns MEDIA_UNREACHABLE (not retryable) and touches only the media URL", async () => {
    const input = {
      igUserId: "ig1",
      accessToken: "tok",
      caption: "A caption.",
      mediaUrl: EXTERNAL_URL,
      mimeType: "image/png",
      kind: "photo" as const,
    };
    const notFound = vi.fn(async () => new Response(null, { status: 404 }));
    const out = await publishInstagramPost(input, { fetchImpl: notFound as unknown as typeof fetch });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "MEDIA_UNREACHABLE" });
    expect(notFound).toHaveBeenCalledTimes(1);

    // A dropped connection and a host that answers 5xx to both HEAD and the ranged GET are the same outcome.
    const dropped = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    expect(await publishInstagramPost(input, { fetchImpl: dropped as unknown as typeof fetch })).toMatchObject({
      ok: false,
      retryable: false,
      code: "MEDIA_UNREACHABLE",
    });
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await publishInstagramPost(input, { fetchImpl: unavailable as unknown as typeof fetch })).toMatchObject({
      ok: false,
      retryable: false,
      code: "MEDIA_UNREACHABLE",
    });
    for (const call of [...notFound.mock.calls, ...dropped.mock.calls, ...unavailable.mock.calls] as unknown[][]) {
      expect(String(call[0]).startsWith(IG)).toBe(false);
    }
  });
});

describe("a hosted (Convex storage) asset next to an external one", () => {
  it("is not touched by the external verify cycle, still queues and publishes while the external link is down", async () => {
    const world = fakeWorld();
    vi.stubGlobal("fetch", world.impl);
    const t = newTest();
    await connectInstagram(t);

    // Hosted: a real stored file recorded through the library's own `store`.
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["pixels"], { type: "image/png" })));
    const hostedId = await t.mutation(api.media.store, { storageId, mimeType: "image/png", filename: "hosted.png" });
    await t.action(api.media.verify, { id: hostedId });
    const hostedBefore = await getAsset(t, hostedId);
    expect(hostedBefore).toMatchObject({ source: "upload", storageId, verifiedAt: T0 });
    expect(hostedBefore!.storageId.startsWith("external:")).toBe(false);

    // External: verified, then the link dies and a re-verify fails.
    const externalId = await registerExternal(t);
    await t.action(api.media.verify, { id: externalId });
    world.down.add(EXTERNAL_URL);
    vi.setSystemTime(T0 + HOUR);
    await expect(t.action(api.media.verify, { id: externalId })).rejects.toThrow();
    const externalAfter = await getAsset(t, externalId);
    expect(externalAfter?.verifiedAt).toBeUndefined();
    expect(externalAfter?.lastVerifyError).toBeTypeOf("string");

    // The hosted row is byte-for-byte what it was.
    expect(await getAsset(t, hostedId)).toEqual(hostedBefore);

    // The external draft can no longer queue (its verification was cleared) ...
    const externalDraft = await igDraftWith(t, externalId, "Dead link");
    await expect(t.mutation(api.slots.enqueue, { draftId: externalDraft, scheduledAt: Date.now() + HOUR })).rejects.toThrow(/VALIDATION:MEDIA_UNVERIFIED:/);

    // ... while the hosted one queues and publishes as if nothing happened, and the publisher does not re-stamp it.
    const hosted = await queueAndPublish(t, hostedId, "Hosted post");
    expect(hosted.tick).toMatchObject({ claimed: 1, published: 1, failed: 0 });
    expect((await getSlot(t, hosted.slotId))?.status).toBe("published");
    expect((await receiptsOf(t, hosted.slotId)).map((r) => r.outcome)).toEqual(["success"]);
    expect(world.publishCalls()).toBe(1);
    expect(await getAsset(t, hostedId)).toEqual(hostedBefore);

    // Only the hosted file counts as stored media; the external link has no file.
    expect(await t.query(api.media.storageSummary, {})).toMatchObject({ files: 1 });
  });
});
