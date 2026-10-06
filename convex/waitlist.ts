import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;
const MAX_SOURCE_LEN = 64;

/**
 * Join the waitlist. Public (no auth) by design — the landing site calls
 * this cross-origin. Validation + dedupe only; rate limiting is a logged
 * follow-up (see Decisions Log). Never throws on duplicates: returns
 * "exists" so the form can't be used to probe membership... (it returns the
 * same shape either way; callers should show one generic confirmation).
 */
export const join = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ status: "joined" | "exists" }> => {
    const email = args.email.trim().toLowerCase();
    if (email.length === 0 || email.length > MAX_EMAIL_LEN) {
      throw new Error("Enter a valid email address.");
    }
    if (!EMAIL_RE.test(email)) {
      throw new Error("Enter a valid email address.");
    }
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { status: "exists" };
    await ctx.db.insert("waitlist", {
      email,
      source: args.source?.slice(0, MAX_SOURCE_LEN),
      createdAt: Date.now(),
    });
    return { status: "joined" };
  },
});

/** Total signups. Powers "join N builders" social proof on the landing. */
export const count = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    // Fine at waitlist scale; switch to the aggregate component past ~10k.
    const rows = await ctx.db.query("waitlist").collect();
    return rows.length;
  },
});
