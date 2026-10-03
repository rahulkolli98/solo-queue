import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

describe("sources.add", () => {
  it("attaches a link to an existing topic and flips it to ready at two sources", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    const a = await t.mutation(api.sources.add, { topicId, kind: "link", url: "https://example.com/a" });
    expect(a.createdTopic).toBe(false);
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("drafting");
    await t.mutation(api.sources.add, { topicId, kind: "quote", text: "250 posts per day" });
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("ready");
    const list = await t.query(api.sources.listByTopic, { topicId });
    expect(list.map((s) => s.kind)).toEqual(["link", "quote"]);
    expect(list[0].label).toBe("example.com");
  });

  it("creates a topic from the capture bar when no topic is given", async () => {
    const t = newTest();
    const out = await t.mutation(api.sources.add, { kind: "note", text: "Per-post fees tax consistency\nmore" });
    expect(out.createdTopic).toBe(true);
    const topic = await t.query(api.topics.get, { id: out.topicId });
    expect(topic?.title).toBe("Per-post fees tax consistency");
    expect(topic?.status).toBe("drafting");
  });

  it("refuses bad input without creating a topic", async () => {
    const t = newTest();
    await expect(t.mutation(api.sources.add, { kind: "link", url: "javascript:alert(1)" })).rejects.toThrow(/BAD_URL/);
    await expect(t.mutation(api.sources.add, { kind: "quote" })).rejects.toThrow(/TEXT_REQUIRED/);
    expect(await t.run(async (ctx) => (await ctx.db.query("topics").collect()).length)).toBe(0);
  });

  it("removing a source drops a topic back to drafting", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    await t.mutation(api.sources.add, { topicId, kind: "link", url: "https://example.com/a" });
    const second = await t.mutation(api.sources.add, { topicId, kind: "note", text: "x" });
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("ready");
    await t.mutation(api.sources.remove, { id: second.sourceId });
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("drafting");
  });
});

describe("topics.board / count / archive", () => {
  it("lists topics with source counts and readiness, leaving archived ones out", async () => {
    const t = newTest();
    const a = await insertTopic(t, "A");
    const b = await insertTopic(t, "B");
    await t.mutation(api.sources.add, { topicId: a, kind: "link", url: "https://example.com/1" });
    await t.mutation(api.topics.archive, { id: b });
    const board = await t.query(api.topics.board, {});
    expect(board.map((x) => x.title)).toEqual(["A"]);
    expect(board[0]).toMatchObject({ sourceCount: 1, ready: false, needsMore: 1 });
    expect(await t.query(api.topics.count, {})).toBe(1);
    await t.mutation(api.topics.unarchive, { id: b });
    expect(await t.query(api.topics.count, {})).toBe(2);
  });

  it("count ignores queued and done topics", async () => {
    const t = newTest();
    const a = await insertTopic(t, "A");
    await insertTopic(t, "B");
    await t.mutation(api.topics.update, { id: a, status: "done" });
    expect(await t.query(api.topics.count, {})).toBe(1);
  });
});

describe("topics.remove", () => {
  it("deletes the topic with its sources and unqueued drafts", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    await insertDraft(t, topicId);
    await t.mutation(api.sources.add, { topicId, kind: "note", text: "n" });
    await t.mutation(api.topics.remove, { id: topicId });
    const left = await t.run(async (ctx) => ({
      topics: (await ctx.db.query("topics").collect()).length,
      drafts: (await ctx.db.query("drafts").collect()).length,
      sources: (await ctx.db.query("sources").collect()).length,
    }));
    expect(left).toEqual({ topics: 0, drafts: 0, sources: 0 });
  });

  it("refuses to delete a topic whose draft has a slot", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    const draftId = await insertDraft(t, topicId);
    await insertSlot(t, draftId, Date.now() + 60_000);
    await expect(t.mutation(api.topics.remove, { id: topicId })).rejects.toThrow(/HAS_SLOTS/);
    expect(await t.query(api.topics.get, { id: topicId })).not.toBeNull();
  });
});

describe("topics.markDoneIfComplete", () => {
  it("stays open while another draft is still queued, then completes", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    const d1 = await insertDraft(t, topicId, "threads");
    const d2 = await insertDraft(t, topicId, "instagram", "caption", "ig-caption-beats");
    await insertSlot(t, d1, Date.now() - 1000, { status: "published" });
    const queued = await insertSlot(t, d2, Date.now() + 60_000, { platform: "instagram" });

    expect(await t.mutation(internal.topics.markDoneIfComplete, { topicId })).toEqual({ done: false });
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("drafting");

    await t.run(async (ctx) => ctx.db.patch(queued, { status: "published" }));
    expect(await t.mutation(internal.topics.markDoneIfComplete, { topicId })).toEqual({ done: true });
    expect((await t.query(api.topics.get, { id: topicId }))?.status).toBe("done");
  });
});

describe("topics.editBrief / setBrief", () => {
  it("marks a founder edit, and a regenerated brief clears the mark", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    await t.mutation(api.topics.editBrief, { id: topicId, brief: "My words" });
    let topic = await t.query(api.topics.get, { id: topicId });
    expect(topic?.brief).toBe("My words");
    expect(topic?.briefEditedAt).toBeTypeOf("number");
    await t.mutation(internal.topics.setBrief, { id: topicId, brief: "Generated" });
    topic = await t.query(api.topics.get, { id: topicId });
    expect(topic?.brief).toBe("Generated");
    expect(topic?.briefEditedAt).toBeUndefined();
  });
});

describe("drafting.storeDraft", () => {
  it("replaces an unqueued draft for the same template but keeps one that has a slot", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    const args = {
      topicId,
      platform: "threads" as const,
      templateKey: "threads-hook-story",
      templateVersion: 1,
      body: "First post\n---\nSecond post",
      charCount: 11,
      constraintOk: true,
      frameKey: "confession",
      format: "thread",
    };
    const first = await t.mutation(internal.drafting.storeDraft, args);
    const second = await t.mutation(internal.drafting.storeDraft, { ...args, body: "Regenerated" });
    const rows = await t.run(async (ctx) => ctx.db.query("drafts").collect());
    expect(rows.map((r) => r._id)).toEqual([second]);
    expect(rows[0]).toMatchObject({ frameKey: "confession", format: "thread" });
    void first;

    // Queue the current draft, then regenerate again: the queued one must stay.
    await insertSlot(t, second as never, Date.now() + 60_000);
    const third = await t.mutation(internal.drafting.storeDraft, { ...args, body: "Another take" });
    const after = await t.run(async (ctx) => ctx.db.query("drafts").collect());
    expect(after.map((r) => r._id).sort()).toEqual([second, third].sort());
  });

  it("normalizes line endings and recomputes the counts", async () => {
    const t = newTest();
    const topicId = await insertTopic(t);
    const id = await t.mutation(internal.drafting.storeDraft, {
      topicId,
      platform: "threads",
      templateKey: "threads-hook-story",
      templateVersion: 1,
      body: "a\r\n---\r\nb",
      charCount: 999,
      constraintOk: false,
    });
    const row = await t.run(async (ctx) => ctx.db.get(id as never));
    expect(row).toMatchObject({ body: "a\n---\nb", charCount: 1, constraintOk: true });
  });
});
