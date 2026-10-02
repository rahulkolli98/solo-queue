import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Small internal mutations the publisher uses to keep a slot honest across
 * crashes and retries: remember the provider container, attach a note, and
 * fail a claim that has been stuck so it is never posted twice by accident.
 */

/** Stuck-claim threshold: a normal publish finishes well inside this. */
export const STALE_CLAIM_MS = 15 * 60_000;

export const STALE_CLAIM_MESSAGE =
  "The publisher stopped while posting this. Check the account before retrying, so it is not posted twice.";

/** Remember the provider container of an unfinished publish so the next attempt resumes it. */
export const setContainer = internalMutation({
  args: { id: v.id("slots"), containerId: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (slot) await ctx.db.patch(args.id, { containerId: args.containerId });
    return null;
  },
});

/** Attach a note to a slot (for example, a thread reply that did not go out). */
export const setNote = internalMutation({
  args: { id: v.id("slots"), note: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (slot) await ctx.db.patch(args.id, { lastError: args.note.slice(0, 500) });
    return null;
  },
});

/**
 * Slots claimed longer than `olderThanMs` ago never finished (the action
 * crashed or timed out). They are failed, not retried: the post may have gone
 * out, so a person checks the account and retries from the Queue drawer.
 */
export const reapStaleClaims = internalMutation({
  args: { now: v.number(), olderThanMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ reaped: number }> => {
    const cutoff = args.now - (args.olderThanMs ?? STALE_CLAIM_MS);
    let reaped = 0;
    for (const platform of ["threads", "instagram"] as const) {
      const claimed = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "claimed")
        )
        .take(50);
      for (const slot of claimed) {
        if ((slot.claimedAt ?? slot.scheduledAt) > cutoff) continue;
        await ctx.db.patch(slot._id, { status: "failed", lastError: STALE_CLAIM_MESSAGE });
        await ctx.db.insert("publishReceipts", {
          slotId: slot._id,
          attemptedAt: args.now,
          outcome: "permanent",
          providerMessage: STALE_CLAIM_MESSAGE,
        });
        reaped += 1;
      }
    }
    return { reaped };
  },
});
