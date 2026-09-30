import { query } from "./_generated/server";

/** Total topics captured. Powers the Research nav badge. */
export const count = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const rows = await ctx.db.query("topics").collect();
    return rows.length;
  },
});
