import { internalMutation } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
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
export const list = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("frames").take(100);
    return rows
      .filter((f) => f.isActive)
      .sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  },
});

/** One frame by key (active or not), or null. */
export const getByKey = operatorQuery({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first(),
});

/** Creates the six default frames the first time the Library asks. Safe to call repeatedly. */
export const ensureDefaults = operatorMutation({
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
export const save = operatorMutation({
  args: {
    key: v.string(),
    name: v.string(),
    beats: v.array(beatArg),
    fits: v.array(fitArg),
    color: v.string(),
    style: v.optional(v.string()),
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
export const setActive = operatorMutation({
  args: { key: v.string(), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) throw refusal("FRAME_NOT_FOUND", "Frame not found — it may have been deleted.");
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

/**
 * Take a frame out of the founder's list. A starter frame is hidden rather than erased (the starter set is
 * re-created when missing, and saving it again by key brings it back); a frame the founder made is deleted.
 * Posts already written keep the key they used (a soft reference). Any format default that pointed at it is
 * cleared, and the old single default frame moves to another frame, so nothing is left pointing at a frame that
 * no longer shows. The last frame cannot be removed.
 */
export const remove = operatorMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("frames")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    const active = (await ctx.db.query("frames").take(100))
      .filter((f) => f.isActive && f.key !== args.key)
      .sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
    if (active.length === 0) {
      throw refusal("LAST_FRAME", "This is your only frame. Make another one first, then remove this one.");
    }

    const settings = await ctx.db.query("appSettings").first();
    if (settings) {
      const voice = settings.voice;
      let next = voice;
      const defaults = voice.formatDefaults;
      if (defaults && Object.values(defaults).some((d) => d?.frameKey === args.key)) {
        const cleaned: Record<string, unknown> = {};
        for (const [kind, d] of Object.entries(defaults)) {
          if (!d) continue;
          const { frameKey, ...rest } = d;
          const kept = frameKey === args.key ? rest : d;
          if (Object.keys(kept).length > 0) cleaned[kind] = kept;
        }
        const { formatDefaults, ...others } = voice;
        void formatDefaults;
        next = Object.keys(cleaned).length > 0 ? { ...others, formatDefaults: cleaned as typeof defaults } : others;
      }
      if (next.defaultFrameKey === args.key) {
        // The old single default is required: move it to the oldest remaining thread frame (or any frame).
        const heir = active.find((f) => f.fits.includes("thread")) ?? active[0];
        next = { ...next, defaultFrameKey: heir.key };
      }
      if (next !== voice) await ctx.db.patch(settings._id, { voice: next });
    }

    if (DEFAULT_FRAMES.some((f) => f.key === args.key)) await ctx.db.patch(row._id, { isActive: false });
    else await ctx.db.delete(row._id);
    return { key: args.key, hidden: DEFAULT_FRAMES.some((f) => f.key === args.key) };
  },
});
