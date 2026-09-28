import { query } from "./_generated/server";

/** Active templates for the composer. Stub bodies in Phase 0 — real copy lands in Phase 2. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("templates")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});
