import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { refusal } from "./lib/slots";
import { DEFAULT_FRAMES, validateFrame } from "./lib/framesModel";

const beatArg = v.object({ label: v.string(), hint: v.string() });
const fitArg = v.union(
  v.literal("thread"),
  v.literal("single"),
  v.literal("reel"),
  v.literal("carousel")
);

/** Insert any default frame whose key is missing. Idempotent; never edits existing frames. */
export async function insertMissingDefaults(ctx: MutationCtx): Promise<number> {
  let inserted = 0;
  for (const frame of DEFAULT_FRAMES) {
    const existing = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", frame.key))
      .first();
    if (existing) continue;
    await ctx.db.insert("frames", {
      ...frame,
      usedCount: 0,
      version: 1,
      isActive: true,
      createdAt: Date.now(),
    });
    inserted += 1;
  }
  return inserted;
}

/** Active frames, oldest first (the Library rail and the Studio picker). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("frames").take(100);
    return rows
      .filter((f) => f.isActive)
      .sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  },
});

/** One frame by key (active or not), or null. */
export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first(),
});

/** Creates the six default frames the first time the Library asks. Safe to call repeatedly. */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx): Promise<{ inserted: number }> => ({
    inserted: await insertMissingDefaults(ctx),
  }),
});

export const seedDefaults = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ inserted: number }> => ({
    inserted: await insertMissingDefaults(ctx),
  }),
});

/**
 * Create or edit a frame. Editing bumps `version` and keeps `usedCount`;
 * drafts that already used the frame keep its key (soft reference), so an
 * edit never rewrites past posts.
 */
export const save = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    beats: v.array(beatArg),
    fits: v.array(fitArg),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const checked = validateFrame(args);
    if (!checked.ok) throw refusal("INVALID_FRAME", checked.message);
    const frame = checked.frame;
    const existing = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", frame.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...frame,
        version: existing.version + 1,
        isActive: true,
      });
      return { key: frame.key, version: existing.version + 1, created: false };
    }
    await ctx.db.insert("frames", {
      ...frame,
      usedCount: 0,
      version: 1,
      isActive: true,
      createdAt: Date.now(),
    });
    return { key: frame.key, version: 1, created: true };
  },
});

/** Hide or restore a frame without deleting it (old drafts still point at its key). */
export const setActive = mutation({
  args: { key: v.string(), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) throw refusal("FRAME_NOT_FOUND", "Frame not found.");
    await ctx.db.patch(row._id, { isActive: args.isActive });
    return { key: args.key, isActive: args.isActive };
  },
});

/** Count one use of a frame (called when a draft is generated from it). */
export const recordUse = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (row) await ctx.db.patch(row._id, { usedCount: row.usedCount + 1 });
    return null;
  },
});
