import { internalMutation } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { compareTopics } from "./lib/topicOrder";
import { readiness } from "./lib/research";
import { refusal } from "./lib/slots";

const statusArg = v.union(
  v.literal("drafting"),
  v.literal("ready"),
  v.literal("queued"),
  v.literal("done")
);

const angleArg = v.object({
  platform: v.string(),
  format: v.string(),
  frameKey: v.string(),
  title: v.string(),
});

const INBOX_LIMIT = 500;

function requireTitle(title: string): string {
  const t = title.trim();
  if (!t) throw refusal("TITLE_REQUIRED", "Give the topic a title.");
  return t;
}

/** Topics still in the research inbox: not archived, not yet queued or done. */
export const count = operatorQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    let n = 0;
    for (const status of ["drafting", "ready"] as const) {
      const rows = await ctx.db
        .query("topics")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .take(INBOX_LIMIT);
      n += rows.filter((t) => t.archivedAt === undefined).length;
    }
    return n;
  },
});

/** Single topic by id (composer + drafting flows). */
export const get = operatorQuery({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Ritual list: unqueued statuses first, oldest first within each rank. Archived topics are left out. */
export const list = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("topics").take(INBOX_LIMIT);
    return rows.filter((t) => t.archivedAt === undefined).sort(compareTopics);
  },
});

async function sourceCountOf(ctx: QueryCtx, topicId: Id<"topics">): Promise<number> {
  const rows = await ctx.db
    .query("sources")
    .withIndex("by_topic_and_createdAt", (q) => q.eq("topicId", topicId))
    .take(200);
  return rows.length;
}

/** Research board rows: each topic with its source count and READY / NEEDS N MORE. */
export const board = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("topics").take(INBOX_LIMIT))
      .filter((t) => t.archivedAt === undefined)
      .sort(compareTopics);
    return await Promise.all(
      rows.map(async (topic) => {
        const sourceCount = await sourceCountOf(ctx, topic._id);
        const r = readiness({
          sourceCount,
          hasNotes: Boolean(topic.notes),
          hasBrief: Boolean(topic.brief),
        });
        return { ...topic, sourceCount, ready: r.ready, needsMore: r.needsMore };
      })
    );
  },
});

export const create = operatorMutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    pillar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notes = args.notes?.trim();
    const sourceUrl = args.sourceUrl?.trim();
    const pillar = args.pillar?.trim();
    return await ctx.db.insert("topics", {
      title: requireTitle(args.title),
      notes: notes ? notes : undefined,
      sourceUrl: sourceUrl ? sourceUrl : undefined,
      pillar: pillar ? pillar : undefined,
      status: "drafting",
      createdAt: Date.now(),
    });
  },
});

export const update = operatorMutation({
  args: {
    id: v.id("topics"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    pillar: v.optional(v.string()),
    status: v.optional(statusArg),
  },
  handler: async (ctx, args) => {
    const patch: {
      title?: string;
      notes?: string;
      sourceUrl?: string;
      pillar?: string;
      status?: "drafting" | "ready" | "queued" | "done";
    } = {};
    if (args.title !== undefined) patch.title = requireTitle(args.title);
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.sourceUrl !== undefined)
      patch.sourceUrl = args.sourceUrl.trim() || undefined;
    if (args.pillar !== undefined) patch.pillar = args.pillar.trim() || undefined;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

/** Hide a topic from the inbox without deleting anything. */
export const archive = operatorMutation({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { archivedAt: Date.now() });
    return args.id;
  },
});

export const unarchive = operatorMutation({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { archivedAt: undefined });
    return args.id;
  },
});

/** Founder edit of the brief. Marks it edited so regenerating must confirm before overwriting. */
export const editBrief = operatorMutation({
  args: { id: v.id("topics"), brief: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      brief: args.brief.trim() || undefined,
      briefEditedAt: Date.now(),
    });
    return args.id;
  },
});

/** Generated brief (research.brief). A regenerated brief clears the "edited" mark. */
export const setBrief = internalMutation({
  args: { id: v.id("topics"), brief: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { brief: args.brief, briefEditedAt: undefined });
    return null;
  },
});

export const setAngles = internalMutation({
  args: { id: v.id("topics"), angles: v.array(angleArg) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { angles: args.angles });
    return null;
  },
});

async function draftsOf(ctx: QueryCtx, topicId: Id<"topics">) {
  return await ctx.db
    .query("drafts")
    .withIndex("by_topic_platform", (q) => q.eq("topicId", topicId))
    .take(200);
}

async function draftHasSlot(ctx: QueryCtx, draftId: Id<"drafts">): Promise<boolean> {
  const slot = await ctx.db
    .query("slots")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .first();
  return slot !== null;
}

/**
 * Delete a topic with its sources and its drafts that were never queued.
 * Refused when any of its drafts has a slot (queued or published): that work
 * must not vanish, so archive the topic instead.
 */
export const remove = operatorMutation({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    const drafts = await draftsOf(ctx, args.id);
    for (const draft of drafts) {
      if (await draftHasSlot(ctx, draft._id)) {
        throw refusal(
          "HAS_SLOTS",
          "This topic has queued or published posts. Archive it instead of deleting."
        );
      }
    }
    for (const draft of drafts) await ctx.db.delete(draft._id);
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_topic_and_createdAt", (q) => q.eq("topicId", args.id))
      .take(500);
    for (const s of sources) await ctx.db.delete(s._id);
    await ctx.db.delete(args.id);
    return args.id;
  },
});

/**
 * Called by the publisher after a post goes out: the topic is done only when
 * none of its drafts still has a scheduled or claimed slot. (Marking it done
 * after the first publish hid topics whose other posts were still queued.)
 */
export const markDoneIfComplete = internalMutation({
  args: { topicId: v.id("topics") },
  handler: async (ctx: MutationCtx, args): Promise<{ done: boolean }> => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) return { done: false };
    const drafts = await draftsOf(ctx, args.topicId);
    for (const draft of drafts) {
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .take(50);
      if (slots.some((s) => s.status === "scheduled" || s.status === "claimed")) {
        return { done: false };
      }
    }
    await ctx.db.patch(args.topicId, { status: "done" });
    return { done: true };
  },
});
