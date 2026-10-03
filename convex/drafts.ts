import { v } from "convex/values";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { checkEditedBody } from "./lib/drafting";
import { refusal } from "./lib/slots";

/**
 * Drafts for one topic, oldest first. Powers the composer tabs (Phase 2)
 * and verifies regeneration replaces instead of duplicating.
 */
export const listByTopic = operatorQuery({
  args: { topicId: v.id("topics") },
  handler: async (ctx, args) => {
    const [threads, instagram, blog] = await Promise.all(
      (["threads", "instagram", "blog"] as const).map((platform) =>
        ctx.db
          .query("drafts")
          .withIndex("by_topic_platform", (q) =>
            q.eq("topicId", args.topicId).eq("platform", platform)
          )
          .collect()
      )
    );
    return [...threads, ...instagram, ...blog].sort(
      (a, b) => a.createdAt - b.createdAt
    );
  },
});

/**
 * Persist an inline edit from the composer. Recomputes charCount/constraintOk
 * server-side with the same mapping as generation, so stored badges never
 * drift from what the queue validator will check.
 */export const update = operatorMutation({
  args: { id: v.id("drafts"), body: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    // Normalize line endings: the textarea reads back LF, so storing CRLF
    // would make display, counts, and exports disagree by a char per line.
    const body = args.body.replace(/\r\n?/g, "\n");
    if (!body.trim()) throw refusal("EMPTY_DRAFT", "A draft can't be empty.");
    if (body.length > 20000)
      throw refusal("TOO_LONG", "Draft is too long (20,000 character max).");
    const check = checkEditedBody(draft.platform, draft.templateKey, body);
    await ctx.db.patch(args.id, {
      body,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
    });
    return null;
  },
});

/** What a hand-written draft of each kind is stored as (matches the generated drafts). */
const MANUAL_KINDS = {
  threads: { platform: "threads", templateKey: "threads-hook-story", format: "thread" },
  caption: { platform: "instagram", templateKey: "ig-caption-beats", format: "caption" },
  reel: { platform: "instagram", templateKey: "reel-script", format: "reel" },
  blog: { platform: "blog", templateKey: "blog-draft", format: "blog" },
} as const;

/**
 * "Write it myself": store text the founder wrote as a draft of the topic, so
 * it gets the same counters, media, editing and queueing as a generated one.
 * If an unqueued draft of the same kind exists it is replaced in place; a draft
 * that already has a post is left alone and a new one is added beside it.
 */
export const createManual = operatorMutation({
  args: {
    topicId: v.id("topics"),
    kind: v.union(v.literal("threads"), v.literal("caption"), v.literal("reel"), v.literal("blog")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) throw refusal("TOPIC_NOT_FOUND", "Topic not found. It may have been deleted.");
    const body = args.body.replace(/\r\n?/g, "\n");
    if (!body.trim()) throw refusal("EMPTY_DRAFT", "A draft can't be empty.");
    if (body.length > 20000) throw refusal("TOO_LONG", "Draft is too long (20,000 character max).");

    const { platform, templateKey, format } = MANUAL_KINDS[args.kind];
    const check = checkEditedBody(platform, templateKey, body);
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) => q.eq("topicId", args.topicId).eq("platform", platform))
      .take(200);
    for (const row of existing.filter((d) => d.templateKey === templateKey)) {
      const slot = await ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", row._id)).first();
      if (slot) continue;
      await ctx.db.patch(row._id, { body, charCount: check.charCount, constraintOk: check.constraintOk });
      return row._id;
    }
    const template = await ctx.db
      .query("templates")
      .withIndex("by_key", (q) => q.eq("key", templateKey))
      .collect();
    const id = await ctx.db.insert("drafts", {
      topicId: args.topicId,
      platform,
      body,
      templateKey,
      templateVersion: template.find((t) => t.isActive)?.version ?? 1,
      format,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
      createdAt: Date.now(),
    });
    if (topic.status === "drafting") await ctx.db.patch(args.topicId, { status: "ready" });
    return id;
  },
});

/**
 * Attach (or detach, with null) a library asset to a draft. IG drafts need
 * this before they can queue; the asset itself must exist. Verification
 * freshness is checked at enqueue time, not here.
 */
export const attachMedia = operatorMutation({
  args: { id: v.id("drafts"), mediaAssetId: v.union(v.id("mediaAssets"), v.null()) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw new Error("Draft not found.");
    if (args.mediaAssetId !== null) {
      const asset = await ctx.db.get(args.mediaAssetId);
      if (!asset) throw new Error("Media not found — it may have been deleted.");
    }
    await ctx.db.patch(args.id, { mediaAssetId: args.mediaAssetId ?? undefined });
    return null;
  },
});
