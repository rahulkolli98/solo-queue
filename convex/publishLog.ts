import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { daysUntil } from "./lib/coverage";
import { isLivePublishing } from "./lib/safety";
import { META_DAILY_LIMITS } from "./lib/settingsModel";

/**
 * Data for the Publishing log (`/log`): is the publisher running, is it
 * paused, how close is each platform to Meta's daily limit, and every
 * publish attempt. Read-only; the publisher itself lives in publish.ts.
 */

const DAY_MS = 86400000;
/** The cron ticks every minute; older than this and the publisher is considered stopped. */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

type KvRow = { value: string } | null;

function parseJson<T>(row: KvRow, fallback: T): T {
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function kv(ctx: QueryCtx, key: string): Promise<KvRow> {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** Publisher health, limits and connection tokens. `now` is passed in (a query must not read the clock). */
export const status = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const beat = parseJson<{ at: number; claimed: number; published: number; failed: number } | null>(
      await kv(ctx, "publishHeartbeat"),
      null
    );
    const pause = parseJson<{ paused?: boolean; reason?: string | null; at?: number }>(
      await kv(ctx, "publishPaused"),
      {}
    );

    const used = { threads: 0, instagram: 0 };
    const receipts = await ctx.db.query("publishReceipts").order("desc").take(500);
    for (const r of receipts) {
      if (r.attemptedAt <= args.now - DAY_MS || r.outcome !== "success") continue;
      const slot = await ctx.db.get(r.slotId);
      if (slot) used[slot.platform] += 1;
    }

    const connections = await ctx.db.query("connections").take(10);
    const ageMs = beat ? Math.max(0, args.now - beat.at) : null;
    return {
      mode: isLivePublishing(process.env.PUBLISH_DRY_RUN) ? ("live" as const) : ("dry-run" as const),
      heartbeat: beat
        ? { ...beat, ageSeconds: Math.round((ageMs ?? 0) / 1000), stale: (ageMs ?? 0) > HEARTBEAT_STALE_MS }
        : null,
      paused: { paused: pause.paused === true, reason: pause.reason ?? null, at: pause.at ?? null },
      usage24h: used,
      limits: META_DAILY_LIMITS,
      connections: connections.map((c) => ({
        platform: c.platform,
        handle: c.handle,
        status: c.status,
        tokenExpiresAt: c.tokenExpiresAt,
        daysLeft: daysUntil(c.tokenExpiresAt, args.now),
        lastError: c.lastError ?? null,
      })),
    };
  },
});

/** Publish attempts, newest first, with the post they belong to. Optionally only one outcome. */
export const attempts = query({
  args: {
    outcome: v.optional(
      v.union(v.literal("success"), v.literal("retryable"), v.literal("permanent"))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db.query("publishReceipts").order("desc").take(500);
    const out = [];
    for (const r of rows) {
      if (args.outcome && r.outcome !== args.outcome) continue;
      const slot = await ctx.db.get(r.slotId);
      const draft = slot ? await ctx.db.get(slot.draftId) : null;
      const topic = draft ? await ctx.db.get(draft.topicId) : null;
      out.push({
        _id: r._id,
        attemptedAt: r.attemptedAt,
        outcome: r.outcome,
        providerMessage: r.providerMessage ?? null,
        slotId: r.slotId,
        platform: slot?.platform ?? null,
        scheduledAt: slot?.originalScheduledAt ?? slot?.scheduledAt ?? null,
        slotStatus: slot?.status ?? null,
        topicTitle: topic?.title ?? null,
        snippet: (draft?.body ?? "").split(/^\s*---\s*$/m)[0].trim().slice(0, 120),
      });
      if (out.length >= cap) break;
    }
    return out;
  },
});
