import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

describe("drafts.remove", () => {
  it("deletes one draft and leaves the topic's other drafts alone", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const thread = await insertDraft(t, topic, "threads", "A thread", "threads-hook-story");
    const caption = await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats");
    await t.mutation(api.drafts.remove, { id: caption });
    const left = await t.run(async (ctx) => ctx.db.query("drafts").collect());
    expect(left.map((d) => d._id)).toEqual([thread]);
  });

  it("refuses a draft that has a post in the queue or published, and keeps it", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "Queued", "threads-hook-story");
    await insertSlot(t, draft, Date.now() + 3600_000);
    await expect(t.mutation(api.drafts.remove, { id: draft })).rejects.toThrow(/HAS_SLOT/);
    expect(await t.run(async (ctx) => ctx.db.get(draft))).not.toBeNull();

    const published = await insertDraft(t, topic, "instagram", "Done", "ig-caption-beats");
    await insertSlot(t, published, Date.now() - 3600_000, { platform: "instagram", status: "published" });
    await expect(t.mutation(api.drafts.remove, { id: published })).rejects.toThrow(/HAS_SLOT/);
  });

  it("sends the topic back to drafting when its last draft goes, not before", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    await t.run(async (ctx) => ctx.db.patch(topic, { status: "ready" }));
    const a = await insertDraft(t, topic, "threads", "A", "threads-hook-story");
    const b = await insertDraft(t, topic, "instagram", "B", "ig-caption-beats");
    await t.mutation(api.drafts.remove, { id: a });
    expect((await t.run(async (ctx) => ctx.db.get(topic)))?.status).toBe("ready");
    await t.mutation(api.drafts.remove, { id: b });
    expect((await t.run(async (ctx) => ctx.db.get(topic)))?.status).toBe("drafting");
  });

  it("deletes a blog draft, and deleting a draft that is already gone does nothing", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const blog = await insertDraft(t, topic, "blog", "# A post", "blog-post");
    await t.mutation(api.drafts.remove, { id: blog });
    await t.mutation(api.drafts.remove, { id: blog });
    expect(await t.run(async (ctx) => ctx.db.query("drafts").collect())).toEqual([]);
  });

  it("keeps the media file a deleted draft used", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "instagram", "Caption", "ig-caption-beats");
    const asset = await t.run(async (ctx) =>
      ctx.db.insert("mediaAssets", {
        storageId: "external:https://cdn.example.com/a.jpg",
        publicUrl: "https://cdn.example.com/a.jpg",
        mimeType: "image/jpeg",
        createdAt: Date.now(),
      })
    );
    await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: asset });
    await t.mutation(api.drafts.remove, { id: draft });
    expect(await t.run(async (ctx) => ctx.db.get(asset))).not.toBeNull();
  });
});
