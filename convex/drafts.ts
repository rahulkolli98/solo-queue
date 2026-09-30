import { query } from "./_generated/server";
import { v } from "convex/values";

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
