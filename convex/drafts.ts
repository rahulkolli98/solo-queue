import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkEditedBody } from "./lib/drafting";

/**
 * Drafts for one topic, oldest first. Powers the composer tabs (Phase 2)
 * and verifies regeneration replaces instead of duplicating.
 */
export const listByTopic = query({
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
 */
export const update = mutation({
  args: { id: v.id("drafts"), body: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw new Error("Draft not found.");
    if (!args.body.trim()) throw new Error("Draft can't be empty.");
    if (args.body.length > 20000)
      throw new Error("Draft is too long (20,000 character max).");
    const check = checkEditedBody(draft.platform, draft.templateKey, args.body);
    await ctx.db.patch(args.id, {
      body: args.body,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
    });
    return null;
  },
});
