import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { insertDraft, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 12, 0);

async function setCleanup(t: TestConvex, cleanupAfterDays: number | undefined) {
  await t.run(async (ctx) => {
    await ctx.db.insert("appSettings", { ...DEFAULT_SETTINGS, media: { igCrop: "4:5", cleanupAfterDays } });
  });
}

async function hostedAsset(t: TestConvex) {
  const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["pixels"], { type: "image/png" })));
  const assetId = await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId,
      publicUrl: "https://files.example/x",
      mimeType: "image/png",
      source: "upload",
      verifiedAt: NOW,
      createdAt: NOW - 100 * DAY,
    })
  );
  return { storageId, assetId };
}

async function igDraftWith(t: TestConvex, assetId: Id<"mediaAssets">) {
  const topic = await insertTopic(t);
  const draftId = await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats");
  await t.run(async (ctx) => ctx.db.patch(draftId, { mediaAssetId: assetId }));
  return draftId;
}

async function slotFor(t: TestConvex, draftId: Id<"drafts">, status: "scheduled" | "claimed" | "published" | "failed", publishedAt?: number) {
  return await t.run(async (ctx) =>
    ctx.db.insert("slots", {
      platform: "instagram",
      draftId,
      scheduledAt: publishedAt ?? NOW + DAY,
      status,
      attempts: 0,
      publishedAt,
      createdAt: NOW,
    })
  );
}

async function fileExists(t: TestConvex, storageId: string): Promise<boolean> {
  return (await t.run(async (ctx) => ctx.db.system.get("_storage", storageId as Id<"_storage">))) !== null;
}

const run = (t: TestConvex) => t.mutation(internal.media.cleanupPublished, { now: NOW });

describe("media cleanup after publishing", () => {
  it("deletes the file when every slot is published and the newest is older than N days, and keeps the row", async () => {
    const t = newTest();
    await setCleanup(t, 30);
    const { storageId, assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 31 * DAY);
    expect(await run(t)).toEqual({ status: "done", deleted: 1 });
    expect(await fileExists(t, storageId)).toBe(false);
    const row = await t.run(async (ctx) => ctx.db.get(assetId));
    expect(row).toMatchObject({ fileDeletedAt: NOW, storageId });
    // Running again changes nothing.
    expect(await run(t)).toEqual({ status: "done", deleted: 0 });
  });

  it("keeps the file when the newest publish is younger than N days", async () => {
    const t = newTest();
    await setCleanup(t, 30);
    const { storageId, assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 60 * DAY);
    await slotFor(t, draft, "published", NOW - 29 * DAY); // newest decides
    expect(await run(t)).toEqual({ status: "done", deleted: 0 });
    expect(await fileExists(t, storageId)).toBe(true);
    expect((await t.run(async (ctx) => ctx.db.get(assetId)))?.fileDeletedAt).toBeUndefined();
  });

  it.each(["scheduled", "claimed", "failed"] as const)(
    "keeps an asset a %s slot of another draft still needs",
    async (status) => {
      const t = newTest();
      await setCleanup(t, 1);
      const { storageId, assetId } = await hostedAsset(t);
      const published = await igDraftWith(t, assetId);
      await slotFor(t, published, "published", NOW - 90 * DAY);
      const other = await igDraftWith(t, assetId);
      await slotFor(t, other, status);
      expect(await run(t)).toEqual({ status: "done", deleted: 0 });
      expect(await fileExists(t, storageId)).toBe(true);
    }
  );

  it("keeps an asset when one draft using it was published but a second slot of the same draft is not", async () => {
    const t = newTest();
    await setCleanup(t, 1);
    const { storageId, assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 90 * DAY);
    await slotFor(t, draft, "scheduled");
    await run(t);
    expect(await fileExists(t, storageId)).toBe(true);
  });

  it("keeps an asset used by a draft that was never queued, one with no publish history, and one used by a source", async () => {
    const t = newTest();
    await setCleanup(t, 1);
    const unqueued = await hostedAsset(t);
    await igDraftWith(t, unqueued.assetId);
    const unused = await hostedAsset(t); // no draft at all
    const withSource = await hostedAsset(t);
    const d = await igDraftWith(t, withSource.assetId);
    await slotFor(t, d, "published", NOW - 90 * DAY);
    const topic = await insertTopic(t);
    await t.run(async (ctx) =>
      ctx.db.insert("sources", { topicId: topic, kind: "screenshot", label: "s", mediaAssetId: withSource.assetId, createdAt: 1 })
    );
    expect(await run(t)).toEqual({ status: "done", deleted: 0 });
    for (const a of [unqueued, unused, withSource]) expect(await fileExists(t, a.storageId)).toBe(true);
  });

  it("never touches an external-URL asset", async () => {
    const t = newTest();
    await setCleanup(t, 1);
    const assetId = await t.mutation(api.media.registerExternal, { url: "https://cdn.example.com/a.jpg", mimeType: "image/jpeg" });
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 90 * DAY);
    expect(await run(t)).toEqual({ status: "done", deleted: 0 });
    expect((await t.run(async (ctx) => ctx.db.get(assetId)))?.fileDeletedAt).toBeUndefined();
  });

  it("does nothing when the setting is unset or there are no settings at all", async () => {
    const t = newTest();
    const { storageId, assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 400 * DAY);
    expect(await run(t)).toEqual({ status: "off" }); // no settings row
    await setCleanup(t, undefined);
    expect(await run(t)).toEqual({ status: "off" });
    expect(await fileExists(t, storageId)).toBe(true);
  });

  it("refuses to attach, queue, verify or carry over a removed file, and Library shows it as removed", async () => {
    const t = newTest();
    await setCleanup(t, 30);
    const { assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 40 * DAY);
    await run(t);

    const fresh = await igDraftWith(t, assetId); // stale link a draft kept from before
    await t.run(async (ctx) => ctx.db.patch(fresh, { mediaAssetId: undefined }));
    const removed = /VALIDATION:MEDIA_REMOVED: This file was removed after it was published\. Upload it again to reuse it\./;
    await expect(t.mutation(api.drafts.attachMedia, { id: fresh, mediaAssetId: assetId })).rejects.toThrow(removed);
    await expect(t.action(api.media.verify, { id: assetId })).rejects.toThrow(removed);

    // Queueing a draft that still points at the removed asset is refused too.
    await t.run(async (ctx) => ctx.db.patch(fresh, { mediaAssetId: assetId }));
    await expect(t.mutation(api.slots.enqueue, { draftId: fresh, tz: "UTC" })).rejects.toThrow(removed);
    // And so is requeueing the old published post.
    const publishedSlot = (await t.run(async (ctx) => ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", draft)).first()))!;
    await expect(t.mutation(api.queueBoard.requeue, { id: publishedSlot._id, tz: "UTC" })).rejects.toThrow(removed);

    // The row stays in the media list, flagged.
    const list = await t.query(api.media.list, {});
    expect(list).toHaveLength(1);
    expect(list[0].fileDeletedAt).toBe(NOW);
    // Storage summary no longer counts it.
    expect(await t.query(api.media.storageSummary, {})).toEqual({ files: 0, bytes: 0 });
  });

  it("the publisher treats a removed file as missing media", async () => {
    const t = newTest();
    await setCleanup(t, 30);
    const { assetId } = await hostedAsset(t);
    const draft = await igDraftWith(t, assetId);
    await slotFor(t, draft, "published", NOW - 40 * DAY);
    await run(t);
    const claimed = await slotFor(t, draft, "claimed");
    const got = await t.query(internal.slots.getForPublish, { id: claimed });
    expect(got?.asset).toBeNull();
  });
});
