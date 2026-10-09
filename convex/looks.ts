import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { isReferenceType, uniqueKey, validateLook } from "./lib/looks";
import { assertFileNotRemoved, refusal } from "./lib/slots";

const planArg = v.array(
  v.object({
    layout: v.union(v.literal("cover"), v.literal("cards"), v.literal("list"), v.literal("close")),
    tone: v.union(v.literal("coral"), v.literal("cream"), v.literal("ink"), v.literal("pink"), v.literal("yellow"), v.literal("blue")),
  })
);

/** Every look, oldest first (the Library list and the Studio picker). A personal library, so a bounded read. */
export const list = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("looks").take(200);
    return rows.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  },
});

/** Reference images must exist, still have their file, and be a type the model can read. */
async function assertReferences(ctx: Pick<MutationCtx, "db">, ids: readonly Id<"mediaAssets">[]): Promise<void> {
  for (const [i, id] of ids.entries()) {
    const asset = await ctx.db.get(id);
    if (!asset) throw refusal("MEDIA_MISSING", `Reference image ${i + 1} is gone from your library. Upload it again.`);
    assertFileNotRemoved(asset);
    if (!isReferenceType(asset.mimeType)) {
      throw refusal("REFERENCE_TYPE", `Reference image ${i + 1} is not a PNG, JPEG or WebP image, which are the types the model can read.`);
    }
  }
}

/**
 * Create a look, or edit one (pass its key). A look needs a name and at least one of a slide plan, a design
 * document and reference images. A new look gets a key made from its name.
 */
export const save = operatorMutation({
  args: {
    key: v.optional(v.string()),
    name: v.string(),
    plan: v.optional(planArg),
    design: v.optional(v.string()),
    referenceIds: v.optional(v.array(v.id("mediaAssets"))),
  },
  handler: async (ctx, args) => {
    const checked = validateLook({ name: args.name, plan: args.plan, design: args.design, referenceIds: args.referenceIds });
    if (!checked.ok) throw refusal("INVALID_LOOK", checked.message);
    const look = checked.look;
    await assertReferences(ctx, (look.referenceIds ?? []) as Id<"mediaAssets">[]);
    const fields = {
      name: look.name,
      plan: look.plan,
      design: look.design,
      referenceIds: look.referenceIds as Id<"mediaAssets">[] | undefined,
      updatedAt: Date.now(),
    };
    if (args.key !== undefined) {
      const existing = await ctx.db
        .query("looks")
        .withIndex("by_key", (q) => q.eq("key", args.key as string))
        .first();
      if (!existing) throw refusal("LOOK_NOT_FOUND", "That look is gone. It may have been deleted.");
      await ctx.db.replace(existing._id, { key: existing.key, usedCount: existing.usedCount, createdAt: existing.createdAt, ...fields });
      return { key: existing.key, created: false };
    }
    const taken = new Set((await ctx.db.query("looks").take(200)).map((l) => l.key));
    const key = uniqueKey(look.name, taken);
    await ctx.db.insert("looks", { key, usedCount: 0, createdAt: Date.now(), ...fields });
    return { key, created: true };
  },
});

/** Delete a look. Its reference images stay in the library; drafts written with it keep working. */
export const remove = operatorMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("looks")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) throw refusal("LOOK_NOT_FOUND", "That look is gone. It may have been deleted.");
    await ctx.db.delete(row._id);
    return null;
  },
});

/** Count one use of a look (called when a carousel is written with it). */
export const recordUse = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("looks")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (row) await ctx.db.patch(row._id, { usedCount: row.usedCount + 1 });
    return null;
  },
});
