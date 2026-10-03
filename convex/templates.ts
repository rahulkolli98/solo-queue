import { v } from "convex/values";
import { operatorMutation, operatorQuery } from "./lib/operator";

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
