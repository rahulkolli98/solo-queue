import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { compareTopics } from "./lib/topicOrder";

const statusArg = v.union(
  v.literal("drafting"),
  v.literal("ready"),
  v.literal("queued"),
  v.literal("done")
);

function requireTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new Error("Title is required.");
  return t;
}

/** Total topics captured. Powers the Research nav badge. */
export const count = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const rows = await ctx.db.query("topics").collect();
    return rows.length;
  },
});

/** Single topic by id (composer + drafting flows). */
export const get = query({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Ritual list: unqueued statuses first, oldest first within each rank. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("topics").collect();
    return rows.sort(compareTopics);
  },
});

export const create = mutation({
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

export const update = mutation({
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

export const remove = mutation({
  args: { id: v.id("topics") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});
