import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { draftStatus } from "./library";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const DAY = 86400000;
const NOW = Date.now();

async function publish(t: ReturnType<typeof newTest>, draftId: Parameters<typeof insertSlot>[1], daysAgo: number, platform: "threads" | "instagram" = "threads") {
  const slot = await insertSlot(t, draftId, NOW - daysAgo * DAY, { platform, status: "published" });
  await t.run(async (ctx) => ctx.db.patch(slot, { publishedAt: NOW - daysAgo * DAY }));
  return slot;
}

describe("library.published", () => {
  it("lists published posts newest first with pillar and requeue state", async () => {
    const t = newTest();
    const a = await insertTopic(t, "Old one");
    const b = await insertTopic(t, "Recent one");
    await t.run(async (ctx) => ctx.db.patch(a, { pillar: "tools" }));
    const da = await insertDraft(t, a, "threads", "Old post body\n---\nsecond", "k1");
    const db = await insertDraft(t, b, "threads", "Recent post body", "k2");
    await publish(t, da, 60);
    await publish(t, db, 2);

    const out = await t.query(api.library.published, { now: NOW });
    expect(out.map((p) => p.topicTitle)).toEqual(["Recent one", "Old one"]);
    expect(out[0]).toMatchObject({ canRequeue: false, restDaysLeft: 28, pillarKey: "build" });
    expect(out[1]).toMatchObject({ canRequeue: true, restDaysLeft: 0, pillarKey: "tools", pillarName: "AI & tools", body: "Old post body" });
  });

  it("filters by platform, pillar and search text", async () => {
    const t = newTest();
    const a = await insertTopic(t, "Rate limits explained");
    const b = await insertTopic(t, "Movie night");
    await t.run(async (ctx) => ctx.db.patch(b, { pillar: "screen" }));
    await publish(t, await insertDraft(t, a, "threads", "limits text", "k1"), 5, "threads");
    await publish(t, await insertDraft(t, b, "instagram", "film text", "k2"), 6, "instagram");

    expect((await t.query(api.library.published, { now: NOW, platform: "instagram" })).map((p) => p.topicTitle)).toEqual(["Movie night"]);
    expect((await t.query(api.library.published, { now: NOW, pillar: "screen" })).map((p) => p.topicTitle)).toEqual(["Movie night"]);
    expect((await t.query(api.library.published, { now: NOW, search: "LIMITS" })).map((p) => p.topicTitle)).toEqual(["Rate limits explained"]);
    expect(await t.query(api.library.published, { now: NOW, search: "zzz" })).toEqual([]);
  });

  it("ignores scheduled and failed slots", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const d = await insertDraft(t, topic);
    await insertSlot(t, d, NOW + DAY);
    await insertSlot(t, d, NOW - DAY, { status: "failed" });
    expect(await t.query(api.library.published, { now: NOW })).toEqual([]);
  });
});

describe("library.drafts", () => {
  it("returns only unqueued drafts, with a status and tab counts", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "T");
    await insertDraft(t, topic, "threads", "x".repeat(600), "k1"); // over limit
    await t.run(async (ctx) => {
      const over = (await ctx.db.query("drafts").collect())[0];
      await ctx.db.patch(over._id, { constraintOk: false });
    });
    await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats"); // needs media
    await insertDraft(t, topic, "threads", "fine", "k2"); // saved
    await insertDraft(t, topic, "blog", "post", "blog-draft"); // blog
    const queued = await insertDraft(t, topic, "threads", "queued", "k3");
    await insertSlot(t, queued, NOW + DAY);

    const out = await t.query(api.library.drafts, {});
    expect(out.cards).toHaveLength(4);
    expect(out.cards.map((c) => c.status).sort()).toEqual(["BLOG", "NEEDS_MEDIA", "OVER_LIMIT", "SAVED"]);
    expect(out.counts).toEqual({ all: 4, needsFixing: 2, saved: 1, blog: 1 });
  });
});

describe("draftStatus", () => {
  it("prioritizes blog, then over limit, then missing Instagram media", () => {
    expect(draftStatus({ platform: "blog", constraintOk: false, mediaAssetId: undefined })).toBe("BLOG");
    expect(draftStatus({ platform: "threads", constraintOk: false, mediaAssetId: undefined })).toBe("OVER_LIMIT");
    expect(draftStatus({ platform: "instagram", constraintOk: true, mediaAssetId: undefined })).toBe("NEEDS_MEDIA");
    expect(draftStatus({ platform: "threads", constraintOk: true, mediaAssetId: undefined })).toBe("SAVED");
  });
});

describe("library.published carries the topic and the draft", () => {
  it("returns topicId and draftId so the list can be filtered by topic", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const draft = await insertDraft(t, topic, "threads", "Body", "k1");
    await publish(t, draft, 3);
    const [post] = await t.query(api.library.published, { now: NOW });
    expect(post.topicId).toBe(topic);
    expect(post.draftId).toBe(draft);
  });
});
