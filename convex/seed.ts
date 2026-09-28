import { mutation } from "./_generated/server";

/**
 * Dev-only seed: one demo topic + active v1 template stubs.
 * Run headlessly with: npx convex run seed:runOnce
 * (Production seeding is out of scope — single operator, dev Ritual only.)
 */
export const runOnce = mutation({
  args: {},
  handler: async (ctx) => {
    const topicId = await ctx.db.insert("topics", {
      title: "Per-post API fees quietly tax consistency",
      notes: "Tell it like a confession, not a pitch.",
      status: "drafting",
      createdAt: Date.now(),
    });
    const templateKeys = [
      "threads-hook-story",
      "ig-caption-beats",
      "reel-script",
    ];
    const templateIds = [];
    for (const key of templateKeys) {
      const id = await ctx.db.insert("templates", {
        key,
        version: 1,
        body: `{{topic}} (stub — real ${key} copy lands in Phase 2)`,
        isActive: true,
        createdAt: Date.now(),
      });
      templateIds.push(id);
    }
    return { topicId, templateIds };
  },
});
