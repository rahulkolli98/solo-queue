import type { MutationCtx } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertFileNotRemoved, refusal } from "./lib/slots";
import { checkSource, readiness, titleFromCapture } from "./lib/research";

const kindArg = v.union(
  v.literal("link"),
  v.literal("quote"),
  v.literal("screenshot"),
  v.literal("note")
);

/** A topic becomes READY once it has enough to post from; never moves backwards past queued. */
async function refreshReadiness(ctx: MutationCtx, topicId: Id<"topics">): Promise<void> {
  const topic = await ctx.db.get(topicId);
  if (!topic || (topic.status !== "drafting" && topic.status !== "ready")) return;
  const sources = await ctx.db
    .query("sources")
    .withIndex("by_topic_and_createdAt", (q) => q.eq("topicId", topicId))
    .take(200);
  const r = readiness({
    sourceCount: sources.length,
    hasNotes: Boolean(topic.notes),
    hasBrief: Boolean(topic.brief),
  });
  const status = r.ready ? "ready" : "drafting";
  if (status !== topic.status) await ctx.db.patch(topicId, { status });
}

/**
 * Add a clipping to a topic. With no `topicId` this is the capture bar: it
 * creates a topic from what was pasted and attaches the clipping to it.
 */
export const add = operatorMutation({
  args: {
    topicId: v.optional(v.id("topics")),
    kind: kindArg,
    url: v.optional(v.string()),
    text: v.optional(v.string()),
    label: v.optional(v.string()),
    mediaAssetId: v.optional(v.id("mediaAssets")),
  },
  handler: async (ctx, args) => {
    const checked = checkSource({ ...args, mediaAssetId: args.mediaAssetId });
    if (!checked.ok) throw refusal(checked.code, checked.message);
    if (checked.mediaAssetId) {
      const asset = await ctx.db.get(checked.mediaAssetId as Id<"mediaAssets">);
      if (asset) assertFileNotRemoved(asset);
    }

    let topicId = args.topicId;
    let createdTopic = false;
    if (topicId) {
      if (!(await ctx.db.get(topicId))) throw refusal("TOPIC_NOT_FOUND", "Topic not found — it may have been deleted.");
    } else {
      topicId = await ctx.db.insert("topics", {
        title: titleFromCapture({ text: checked.text, url: checked.url }),
        status: "drafting",
        createdAt: Date.now(),
      });
      createdTopic = true;
    }

    const sourceId = await ctx.db.insert("sources", {
      topicId,
      kind: checked.kind,
      url: checked.url,
      text: checked.text,
      label: checked.label,
      mediaAssetId: checked.mediaAssetId as Id<"mediaAssets"> | undefined,
      createdAt: Date.now(),
    });
    await refreshReadiness(ctx, topicId);
    return { topicId, sourceId, createdTopic };
  },
});

/** A topic's clippings, oldest first. */
export const listByTopic = operatorQuery({
  args: { topicId: v.id("topics") },
  handler: async (ctx, args) =>
    ctx.db
      .query("sources")
      .withIndex("by_topic_and_createdAt", (q) => q.eq("topicId", args.topicId))
      .take(200),
});

export const remove = operatorMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return args.id;
    await ctx.db.delete(args.id);
    await refreshReadiness(ctx, row.topicId);
    return args.id;
  },
});
