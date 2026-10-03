import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertDraft, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const HOUR = 3600_000;

async function igDraftWithMedia(t: TestConvex, verifiedAt: number | undefined) {
  const topic = await insertTopic(t);
  const draft = await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats");
  const asset = await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: "external:https://cdn.example.com/a.jpg",
      publicUrl: "https://cdn.example.com/a.jpg",
      mimeType: "image/jpeg",
      verifiedAt,
      createdAt: Date.now(),
    })
  );
  await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: asset });
  return { topic, draft, asset };
}

describe("Instagram enqueue and media", () => {
  it("queues an Instagram draft whose media was verified recently", async () => {
    const t = newTest();
    const { draft } = await igDraftWithMedia(t, Date.now() - HOUR);
    const out = await t.mutation(api.slots.enqueue, { draftId: draft, tz: "UTC" });
    expect(out.scheduledAt).toBeGreaterThan(Date.now());
    const slot = await t.run(async (ctx) => ctx.db.get(out.slotId));
    expect(slot).toMatchObject({ platform: "instagram", status: "scheduled" });
  });

  it("refuses media that was never verified", async () => {
    const t = newTest();
    const { draft } = await igDraftWithMedia(t, undefined);
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).rejects.toThrow(/MEDIA_UNVERIFIED/);
  });

  it("refuses media whose verification is more than 24 hours old", async () => {
    const t = newTest();
    const { draft } = await igDraftWithMedia(t, Date.now() - 25 * HOUR);
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).rejects.toThrow(/MEDIA_STALE/);
  });

  it("refuses when the attached file was deleted", async () => {
    const t = newTest();
    const { draft, asset } = await igDraftWithMedia(t, Date.now());
    await t.run(async (ctx) => ctx.db.delete(asset as Id<"mediaAssets">));
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).rejects.toThrow(/MEDIA_MISSING/);
  });

  it("queueTopic queues the Instagram caption once its media is verified", async () => {
    const t = newTest();
    const { topic } = await igDraftWithMedia(t, Date.now() - HOUR);
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC" });
    expect(out.queued.map((q) => q.format)).toEqual(["IG caption"]);
  });
});
