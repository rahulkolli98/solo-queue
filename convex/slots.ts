import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Scheduled (not yet claimed) slots per platform — powers at-risk warnings. */
export const countScheduledByPlatform = query({
  args: { platform: v.union(v.literal("threads"), v.literal("instagram")) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        q.eq("platform", args.platform).eq("status", "scheduled")
      )
      .collect();
    return rows.length;
  },
});

/**
 * DEV-ONLY drill helper: insert a coherent topic → draft → scheduled slot
 * chain to verify at-risk warnings. Never call from UI code.
 */
export const drillInsertSlot = internalMutation({
  args: {
    platform: v.union(v.literal("threads"), v.literal("instagram")),
    scheduledAt: v.number(),
  },
  handler: async (ctx, args) => {
    const topicId = await ctx.db.insert("topics", {
      title: "Drill topic (dev only)",
      status: "queued",
      createdAt: Date.now(),
    });
    const draftId = await ctx.db.insert("drafts", {
      topicId,
      platform: args.platform,
      body: "Drill draft (dev only).",
      templateKey: "drill",
      templateVersion: 0,
      charCount: 24,
      constraintOk: true,
      createdAt: Date.now(),
    });
    return await ctx.db.insert("slots", {
      platform: args.platform,
      draftId,
      scheduledAt: args.scheduledAt,
      status: "scheduled",
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});
