import { internalMutation } from "./_generated/server";
import { V1_TEMPLATES } from "./templateCopy";

const STUB_MARKER = "stub — real";

/**
 * Dev-only seed: one demo topic + v1 template copy.
 * Run headlessly with: npx convex run seed:runOnce (internal, so it is not
 * callable from the browser or by anyone with the deployment URL).
 * Idempotent: inserts missing template keys, repairs stub bodies in place,
 * never duplicates. (Production seeding is out of scope — single operator,
 * dev Ritual only.)
 */
export const runOnce = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingTopics = await ctx.db.query("topics").collect();
    let topicId = existingTopics[0]?._id;
    if (!topicId) {
      topicId = await ctx.db.insert("topics", {
        title: "Per-post API fees quietly tax consistency",
        notes: "Tell it like a confession, not a pitch.",
        status: "drafting",
        createdAt: Date.now(),
      });
    }
    const templateIds = [];
    for (const { key, body } of V1_TEMPLATES) {
      const rows = await ctx.db
        .query("templates")
        .withIndex("by_key", (q) => q.eq("key", key))
        .collect();
      const active = rows.find((r) => r.isActive);
      if (!active) {
        templateIds.push(
          await ctx.db.insert("templates", {
            key,
            version:
              rows.reduce((max, r) => Math.max(max, r.version), 0) + 1,
            body,
            isActive: true,
            createdAt: Date.now(),
          })
        );
      } else if (active.body.includes(STUB_MARKER)) {
        await ctx.db.patch(active._id, { body });
        templateIds.push(active._id);
      } else {
        templateIds.push(active._id);
      }
    }
    return { topicId, templateIds };
  },
});
