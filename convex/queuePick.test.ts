import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { insertDraft, insertTopic, newTest } from "../src/test-utils/convex";

const HOUR = 3600_000;

/** A topic with a thread, a caption with verified media, and a reel script with no video yet. */
async function topicWithUnfinishedReel() {
  const t = newTest();
  const topic = await insertTopic(t);
  await insertDraft(t, topic, "threads", "A thread post", "threads-hook-story");
  const caption = await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats");
  await insertDraft(t, topic, "instagram", "A reel script", "reel-script");
  const asset = await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: "external:https://cdn.example.com/a.jpg",
      publicUrl: "https://cdn.example.com/a.jpg",
      mimeType: "image/jpeg",
      verifiedAt: Date.now() - HOUR,
      createdAt: Date.now(),
    })
  );
  await t.mutation(api.drafts.attachMedia, { id: caption, mediaAssetId: asset });
  return { t, topic };
}

describe("queueTopic with a picked set of drafts", () => {
  it("with nothing picked, queues what it can and reports the reel as skipped (unchanged)", async () => {
    const { t, topic } = await topicWithUnfinishedReel();
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC" });
    expect(out.queued.map((q) => q.templateKey).sort()).toEqual(["ig-caption-beats", "threads-hook-story"]);
    expect(out.skipped.map((s) => s.templateKey)).toEqual(["reel-script"]);
  });

  it("queues only the picked drafts and does not report the others", async () => {
    const { t, topic } = await topicWithUnfinishedReel();
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: ["ig-caption-beats"] });
    expect(out.queued.map((q) => q.templateKey)).toEqual(["ig-caption-beats"]);
    expect(out.skipped).toEqual([]);
    const slots = await t.run(async (ctx) => ctx.db.query("slots").collect());
    expect(slots).toHaveLength(1);
    expect(slots[0].platform).toBe("instagram");
  });

  it("a picked draft that cannot go is still reported, with its reason", async () => {
    const { t, topic } = await topicWithUnfinishedReel();
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: ["reel-script"] });
    expect(out.queued).toEqual([]);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]).toMatchObject({ templateKey: "reel-script", code: "MEDIA_REQUIRED" });
  });

  it("an empty pick queues nothing", async () => {
    const { t, topic } = await topicWithUnfinishedReel();
    const out = await t.mutation(api.slots.queueTopic, { topicId: topic, tz: "UTC", templateKeys: [] });
    expect(out).toEqual({ queued: [], skipped: [] });
  });
});
