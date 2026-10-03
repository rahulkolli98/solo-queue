import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STALE_CLAIM_MESSAGE } from "./slotRecovery";
import { takenTimes } from "./lib/slotPlanning";
import { instagramCaption } from "./lib/drafting";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const DAY = 86400000;

async function insertAsset(t: ReturnType<typeof newTest>): Promise<Id<"mediaAssets">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: "external:https://cdn.example.com/a.jpg",
      publicUrl: "https://cdn.example.com/a.jpg",
      mimeType: "image/jpeg",
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    })
  );
}

describe("retry and the provider container", () => {
  it("drops the container of a failed publish so the retry builds a fresh post", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    const slot = await insertSlot(t, draft, Date.now() - 1000, { status: "failed" });
    await t.run(async (ctx) => ctx.db.patch(slot, { containerId: "c1", lastError: "Image rejected." }));
    await t.mutation(api.queueBoard.retry, { id: slot });
    expect((await t.run(async (ctx) => ctx.db.get(slot)))?.containerId).toBeUndefined();
  });

  it("keeps the container when the publisher itself stopped mid-post", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    const slot = await insertSlot(t, draft, Date.now() - 1000, { status: "failed" });
    await t.run(async (ctx) => ctx.db.patch(slot, { containerId: "c1", lastError: STALE_CLAIM_MESSAGE }));
    await t.mutation(api.queueBoard.retry, { id: slot });
    expect((await t.run(async (ctx) => ctx.db.get(slot)))?.containerId).toBe("c1");
  });
});

describe("queueing a draft that already has a post", () => {
  it("refuses a draft that already published, and queueTopic skips it", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    await insertSlot(t, draft, Date.now() - DAY, { status: "published" });
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).rejects.toThrow(/ALREADY_PUBLISHED/);
    const res = await t.mutation(api.slots.queueTopic, { topicId: topic });
    expect(res.queued).toHaveLength(0);
    expect(res.skipped.find((s) => s.templateKey === "threads-hook-story")?.code).toBe("ALREADY_PUBLISHED");
  });

  it("refuses a draft with a failed post and one that is in flight", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const failed = await insertDraft(t, topic);
    await insertSlot(t, failed, Date.now() - DAY, { status: "failed" });
    await expect(t.mutation(api.slots.enqueue, { draftId: failed })).rejects.toThrow(/ALREADY_FAILED/);
    const claimed = await insertDraft(t, topic, "threads", "Other", "other-key");
    await insertSlot(t, claimed, Date.now() - 1000, { status: "claimed" });
    await expect(t.mutation(api.slots.enqueue, { draftId: claimed })).rejects.toThrow(/ALREADY_QUEUED/);
  });

  it("refuses a second requeue while the first is still waiting", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    const old = await insertSlot(t, draft, Date.now() - 60 * DAY, { status: "published" });
    await t.run(async (ctx) => ctx.db.patch(old, { publishedAt: Date.now() - 60 * DAY }));
    await t.mutation(api.queueBoard.requeue, { id: old });
    await expect(t.mutation(api.queueBoard.requeue, { id: old })).rejects.toThrow(/ALREADY_QUEUED/);
  });

  it("refuses to requeue an Instagram post whose media is gone", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "instagram", "Caption", "ig-caption-beats");
    const old = await insertSlot(t, draft, Date.now() - 60 * DAY, { status: "published", platform: "instagram" });
    await t.run(async (ctx) => ctx.db.patch(old, { publishedAt: Date.now() - 60 * DAY }));
    await expect(t.mutation(api.queueBoard.requeue, { id: old })).rejects.toThrow(/MEDIA_MISSING/);
  });
});

describe("daily cap", () => {
  it("counts posts that already went out today", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    const published = await insertSlot(t, draft, Date.now() - 3600000, { status: "published" });
    const old = await insertSlot(t, draft, Date.now() - 10 * DAY, { status: "published" });
    const times = await t.run(async (ctx) => takenTimes(ctx, "threads"));
    const rows = await t.run(async (ctx) => [await ctx.db.get(published), await ctx.db.get(old)]);
    expect(times).toContain(rows[0]!.scheduledAt);
    expect(times).not.toContain(rows[1]!.scheduledAt);
  });
});

describe("regenerating a draft", () => {
  it("keeps the media attached to the Instagram draft it replaces", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "instagram", "Old caption", "ig-caption-beats");
    const asset = await insertAsset(t);
    await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: asset });
    await t.mutation(internal.drafting.storeDraft, {
      topicId: topic,
      platform: "instagram",
      templateKey: "ig-caption-beats",
      templateVersion: 1,
      body: "New caption",
      charCount: 11,
      constraintOk: true,
    });
    const rows = await t.run(async (ctx) => ctx.db.query("drafts").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ body: "New caption", mediaAssetId: asset });
  });
});

describe("small contracts", () => {
  it("media.byIds returns the assets that exist, whatever their age", async () => {
    const t = newTest();
    const a = await insertAsset(t);
    const gone = await insertAsset(t);
    await t.run(async (ctx) => ctx.db.delete(gone));
    const out = await t.query(api.media.byIds, { ids: [a, gone] });
    expect(out.map((x) => x._id)).toEqual([a]);
  });

  it("slotRecovery.statusOf reports a slot's status", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    const slot = await insertSlot(t, draft, Date.now(), { status: "published" });
    expect(await t.query(internal.slotRecovery.statusOf, { id: slot })).toBe("published");
  });

  it("drafts.update refuses with readable codes", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    await expect(t.mutation(api.drafts.update, { id: draft, body: "   " })).rejects.toThrow(/EMPTY_DRAFT/);
    await t.run(async (ctx) => ctx.db.delete(draft));
    await expect(t.mutation(api.drafts.update, { id: draft, body: "x" })).rejects.toThrow(/DRAFT_NOT_FOUND/);
  });

  it("Today is not first-run when the only slots are old published ones", async () => {
    const t = newTest();
    const draft = await insertDraft(t, await insertTopic(t));
    await insertSlot(t, draft, Date.now() - 90 * DAY, { status: "published" });
    const out = await t.query(api.today.summary, { now: Date.now(), tz: "UTC" });
    expect(out.firstRun).toBe(false);
  });
});

describe("instagramCaption", () => {
  it("posts only the caption of a reel draft", () => {
    const body = "1. 0:00–0:02 — On screen: Hi.\n---\nDay 4. Follow the build.";
    expect(instagramCaption("reel-script", body)).toBe("Day 4. Follow the build.");
  });
  it("drops the template's counter footer from a caption draft", () => {
    const body = "Opener.\n\nStory.\n\n#build\n---\nCAPTION · 24 / 2,200 · 1 HASHTAGS";
    expect(instagramCaption("ig-caption-beats", body)).toBe("Opener.\n\nStory.\n\n#build");
  });
  it("leaves a plain caption untouched", () => {
    expect(instagramCaption("ig-caption-beats", " Just a caption. ")).toBe("Just a caption.");
    expect(instagramCaption("ig-caption-beats", "One\n---\nTwo")).toBe("One\n---\nTwo");
  });
});
