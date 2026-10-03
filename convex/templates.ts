import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { V1_TEMPLATES } from "./templateCopy";

/**
 * Make sure every built-in template key has an active version. Idempotent and
 * never touches a key that already has one (the founder's saved versions win).
 * Drafting calls this first, so a fresh deployment works without a seed step.
 */
export const ensureDefaults = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ inserted: number }> => {
    let inserted = 0;
    for (const { key, body } of V1_TEMPLATES) {
      const rows = await ctx.db.query("templates").withIndex("by_key", (q) => q.eq("key", key)).collect();
      if (rows.some((r) => r.isActive)) continue;
      await ctx.db.insert("templates", {
        key,
        version: rows.reduce((max, r) => Math.max(max, r.version), 0) + 1,
        body,
        isActive: true,
        createdAt: Date.now(),
      });
      inserted += 1;
    }
    return { inserted };
  },
});

/** Active templates for the composer (exactly one active version per key). */
export const list = operatorQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("templates")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/** Full version history for one key, newest first. Old versions are retained. */
export const history = operatorQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("templates")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();
    return rows.sort((a, b) => b.version - a.version);
  },
});

/**
 * Save a new version: deactivates previous actives for the key, inserts the
 * new body as the next version number. Old versions are never deleted —
 * rewrite the template before blaming the model (Vision § Risks).
 */
export const saveVersion = operatorMutation({
  args: { key: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const key = args.key.trim();
    const body = args.body.trim();
    if (!key) throw new Error("Template key is required.");
    if (!body) throw new Error("Template body can't be empty.");
    const existing = await ctx.db
      .query("templates")
      .withIndex("by_key", (q) => q.eq("key", key))
      .collect();
    const nextVersion =
      existing.reduce((max, r) => Math.max(max, r.version), 0) + 1;
    for (const row of existing) {
      if (row.isActive) await ctx.db.patch(row._id, { isActive: false });
    }
    return await ctx.db.insert("templates", {
      key,
      version: nextVersion,
      body,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});
