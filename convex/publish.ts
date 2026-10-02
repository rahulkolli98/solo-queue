import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { splitPosts } from "./lib/drafting";
import { isLivePublishing } from "./lib/safety";
import {
  publishInstagramPost,
  type InstagramKind,
} from "./providers/instagram";
import {
  publishThreadsPost,
} from "./providers/threads";

const DAY_MS = 86400000;
const MAX_ATTEMPTS = 5;
/** Rolling publishing caps per 24h (Meta-safe personal headroom). */
const ROLLING_LIMITS = { threads: 250, instagram: 100 } as const;

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000 * 2 ** Math.min(Math.max(attempts, 0), 4), 2 * 3600_000);
}

/** Dry-run unless PUBLISH_DRY_RUN is exactly "0" (safe default; see lib/safety). */
function isDryRun(): boolean {
  return !isLivePublishing(process.env.PUBLISH_DRY_RUN);
}

/** Pause flag lives in settings so the dashboard can read/flip it. */
export const getPauseState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "publishPaused"))
      .unique();
    try {
      const v = JSON.parse(row?.value ?? "{}") as {
        paused?: boolean;
        reason?: string;
        at?: number;
      };
      return { paused: v.paused === true, reason: v.reason ?? null, at: v.at ?? null };
    } catch {
      return { paused: false, reason: null, at: null };
    }
  },
});

export const recordHeartbeat = internalMutation({
  args: {
    at: v.number(),
    claimed: v.number(),
    published: v.number(),
    failed: v.number(),
  },
  handler: async (ctx, args) => {
    const value = JSON.stringify({
      at: args.at,
      claimed: args.claimed,
      published: args.published,
      failed: args.failed,
    });
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "publishHeartbeat"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: "publishHeartbeat",
        value,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const addReceipt = internalMutation({
  args: {
    slotId: v.id("slots"),
    attemptedAt: v.number(),
    outcome: v.union(v.literal("success"), v.literal("retryable"), v.literal("permanent")),
    providerMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("publishReceipts", {
      slotId: args.slotId,
      attemptedAt: args.attemptedAt,
      outcome: args.outcome,
      providerMessage: args.providerMessage?.slice(0, 500),
    });
    return null;
  },
});

/** Successful publishes per platform in the last 24h (rolling guard input). */
export const successCounts24h = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const counts = { threads: 0, instagram: 0 };
    const rows = await ctx.db.query("publishReceipts").order("desc").take(500);
    for (const r of rows) {
      if (r.attemptedAt <= args.now - DAY_MS) continue;
      if (r.outcome !== "success") continue;
      const slot = await ctx.db.get(r.slotId);
      if (!slot) continue;
      if (slot.platform === "threads" || slot.platform === "instagram") {
        counts[slot.platform] += 1;
      }
    }
    return counts;
  },
});

/** Due slots without claiming (dry-run reader — never writes). */
export const listDue = internalQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const due: { _id: string; platform: string; scheduledAt: number }[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled").lte("scheduledAt", args.now)
        )
        .take(cap);
      for (const r of rows) due.push({ _id: r._id, platform, scheduledAt: r.scheduledAt });
    }
    due.sort((a, b) => a.scheduledAt - b.scheduledAt);
    return due.slice(0, cap);
  },
});

export interface DayCounts {
  day: string;
  success: number;
  retryable: number;
  permanent: number;
}

/**
 * Per-day outcome counts (UTC buckets), newest first. Feeds the Health
 * screen; the mixed-outcome drill in the roadmap verifies the bucketing.
 */
export const countsByDay = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<DayCounts[]> => {
    const n = Math.min(Math.max(args.days ?? 14, 1), 90);
    const now = Date.now();
    const start = now - n * DAY_MS;
    const buckets = new Map<string, DayCounts>();
    const rows = await ctx.db.query("publishReceipts").order("desc").take(1000);
    for (const r of rows) {
      if (r.attemptedAt < start) continue;
      const day = new Date(r.attemptedAt).toISOString().slice(0, 10);
      let b = buckets.get(day);
      if (!b) {
        b = { day, success: 0, retryable: 0, permanent: 0 };
        buckets.set(day, b);
      }
      b[r.outcome] += 1;
    }
    return [...buckets.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  },
});

interface TickResult {
  claimed: number;
  published: number;
  failed: number;
  limited: number;
  paused: boolean;
  dryRun: boolean;
}

/**
 * Publisher tick: claim due slots, publish each via its provider module,
 * write receipts, retry transient failures with backoff, fail permanently
 * past MAX_ATTEMPTS or on terminal outcomes. AUTH trips the pause guard.
 *
 * Dry-run (the default; live only when PUBLISH_DRY_RUN is exactly "0"): no
 * claims, no provider calls — logs what would happen and returns it.
 *
 * Internal: only the cron may call it. A public tick would let anyone with
 * the deployment URL trigger real publishing.
 */
export const tick = internalAction({
  args: {},
  handler: async (ctx): Promise<TickResult> => {
    const now = Date.now();
    const pause = await ctx.runQuery(internal.publish.getPauseState);
    if (pause.paused && !(pause.reason ?? "").startsWith("rolling-limit")) {
      await ctx.runMutation(internal.publish.recordHeartbeat, {
        at: now,
        claimed: 0,
        published: 0,
        failed: 0,
      });
      console.log(`publish.tick: paused (${pause.reason ?? "no reason"}) — skipping claims.`);
      return { claimed: 0, published: 0, failed: 0, limited: 0, paused: true, dryRun: isDryRun() };
    }

    if (isDryRun()) {
      const due = await ctx.runQuery(internal.publish.listDue, { now, limit: 10 });
      const counts = await ctx.runQuery(internal.publish.successCounts24h, { now });
      for (const s of due) {
        console.log(
          `publish.tick DRY RUN: would claim ${s._id} (${s.platform}, due ${new Date(s.scheduledAt).toISOString()}); 24h successes threads=${counts.threads} instagram=${counts.instagram}.`
        );
      }
      console.log(`publish.tick DRY RUN: ${due.length} due, 0 claimed, 0 published.`);
      // Heartbeat in dry-run too, so "the publisher is running" stays visible.
      await ctx.runMutation(internal.publish.recordHeartbeat, {
        at: now,
        claimed: 0,
        published: 0,
        failed: 0,
      });
      return {
        claimed: 0,
        published: 0,
        failed: 0,
        limited: 0,
        paused: false,
        dryRun: true,
      };
    }

    const ids = await ctx.runMutation(internal.slots.claimDue, { now, limit: 10 });
    let published = 0;
    let failed = 0;
    let limited = 0;

    for (const slotId of ids) {
      const item = await ctx.runQuery(internal.slots.getForPublish, { id: slotId });
      if (!item) continue;
      const { slot, draft, asset, topicTitle } = item;

      // Rolling guard: defer (don't fail) when the 24h cap is reached.
      const counts = await ctx.runQuery(internal.publish.successCounts24h, { now });
      const cap = ROLLING_LIMITS[slot.platform];
      const used =
        slot.platform === "threads" ? counts.threads : counts.instagram;
      if (used >= cap) {
        await ctx.runMutation(internal.slots.release, {
          id: slot._id,
          notBefore: now + 3600_000,
        });
        console.log(
          `publish.tick: rolling limit hit for ${slot.platform} (${used}/${cap}) — deferred ${slot._id}.`
        );
        limited += 1;
        continue;
      }

      const outcome = await publishOne(ctx, slot, draft, asset, topicTitle);
      if (outcome === "published") published += 1;
      else if (outcome === "failed") failed += 1;
      else limited += 1; // deferred (limit tripped mid-batch)
    }

    await ctx.runMutation(internal.publish.recordHeartbeat, {
      at: now,
      claimed: ids.length,
      published,
      failed,
    });
    return { claimed: ids.length, published, failed, limited, paused: false, dryRun: false };
  },
});

type PublishItem = {
  slot: {
    _id: Id<"slots">;
    platform: "threads" | "instagram";
    attempts: number;
    scheduledAt: number;
  };
  draft: {
    _id: Id<"drafts">;
    topicId: Id<"topics">;
    platform: "threads" | "instagram" | "blog";
    body: string;
    templateKey: string;
    mediaAssetId?: Id<"mediaAssets">;
  };
  asset: { publicUrl: string; mimeType: string; verifiedAt?: number } | null;
  topicTitle: string;
};

async function publishOne(ctx: ActionCtx, slot: PublishItem["slot"], draft: PublishItem["draft"], asset: PublishItem["asset"], topicTitle: string): Promise<"published" | "failed" | "deferred"> {
  const now = Date.now();
  console.log(
    `publish.tick: attempting ${slot.platform} slot ${slot._id} (attempt ${slot.attempts + 1}) for "${topicTitle}".`
  );

  if (slot.attempts >= MAX_ATTEMPTS) {
    return markPermanent(ctx, slot._id, now, `Gave up after ${slot.attempts} attempts — last error preserved below.`);
  }

  if (slot.platform === "threads") {
    const conn = await ctx.runQuery(internal.connections.getOne, { platform: "threads" });
    if (!conn) return markPermanent(ctx, slot._id, now, "No Threads connection — reconnect in Settings.");
    // v1: one post per call — publish the first post of a multi-post draft.
    // Thread chaining needs a reply param the APIs don't document here yet.
    const posts = splitPosts(draft.body);
    const text = (posts.length > 0 ? posts[0] : draft.body).trim();
    if (!text) return markPermanent(ctx, slot._id, now, "Threads draft is empty after splitting posts.");
    const note = posts.length > 1 ? ` [post 1 of ${posts.length} — thread chaining not yet supported]` : "";
    const out = await publishThreadsPost(
      { userId: conn.platformUserId, accessToken: conn.accessToken, text, mediaType: "TEXT" },
    );
    return await settleThreadsOutcome(ctx, slot, draft, out, now, topicTitle, note);
  }

  // instagram
  const conn = await ctx.runQuery(internal.connections.getOne, { platform: "instagram" });
  if (!conn) return markPermanent(ctx, slot._id, now, "No Instagram connection — reconnect in Settings.");
  if (!asset) return markPermanent(ctx, slot._id, now, "Attached media is gone — pick another in the Library.");
  const kind: InstagramKind = draft.templateKey === "reel-script" ? "reel" : "photo";
  const out = await publishInstagramPost({
    igUserId: conn.platformUserId,
    accessToken: conn.accessToken,
    caption: draft.body,
    mediaUrl: asset.publicUrl,
    mimeType: asset.mimeType,
    kind,
  });
  return await settleInstagramOutcome(ctx, slot, draft, out, now);
}

async function markPermanent(ctx: ActionCtx, slotId: Id<"slots">, now: number, message: string): Promise<"failed"> {
  await ctx.runMutation(internal.slots.setFailed, { id: slotId, error: message });
  await ctx.runMutation(internal.publish.addReceipt, {
    slotId,
    attemptedAt: now,
    outcome: "permanent",
    providerMessage: message,
  });
  return "failed";
}

async function settleThreadsOutcome(
  ctx: ActionCtx,
  slot: PublishItem["slot"],
  draft: PublishItem["draft"],
  out: Awaited<ReturnType<typeof publishThreadsPost>>,
  now: number,
  _topicTitle: string,
  note: string
): Promise<"published" | "failed" | "deferred"> {
  void _topicTitle;
  if (out.ok) {
    await ctx.runMutation(internal.slots.setPublished, {
      id: slot._id,
      platformId: out.mediaId,
    });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "success",
      providerMessage: `Published threads post ${out.mediaId} (${out.via}).${note}`,
    });
    await ctx.runMutation(api.topics.update, { id: draft.topicId, status: "done" });
    return "published";
  }
  if (out.code === "AUTH") {
    await ctx.runMutation(internal.publish.setPublishPausedInternal, {
      paused: true,
      reason: `auth-threads: ${out.message}`,
    });
    await ctx.runMutation(internal.slots.release, { id: slot._id });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "retryable",
      providerMessage: out.message,
    });
    return "deferred";
  }
  if (!out.retryable) {
    await ctx.runMutation(internal.slots.setFailed, { id: slot._id, error: out.message });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "permanent",
      providerMessage: out.message,
    });
    return "failed";
  }
  if (slot.attempts + 1 >= MAX_ATTEMPTS) {
    await ctx.runMutation(internal.slots.setFailed, {
      id: slot._id,
      error: `Gave up after ${MAX_ATTEMPTS} attempts: ${out.message}`,
    });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "permanent",
      providerMessage: out.message,
    });
    return "failed";
  }
  await ctx.runMutation(internal.slots.release, {
    id: slot._id,
    notBefore: now + backoffMs(slot.attempts + 1),
  });
  await ctx.runMutation(internal.publish.addReceipt, {
    slotId: slot._id,
    attemptedAt: now,
    outcome: "retryable",
    providerMessage: out.message,
  });
  return "deferred";
}

async function settleInstagramOutcome(
  ctx: ActionCtx,
  slot: PublishItem["slot"],
  draft: PublishItem["draft"],
  out: Awaited<ReturnType<typeof publishInstagramPost>>,
  now: number
): Promise<"published" | "failed" | "deferred"> {
  if (out.ok) {
    await ctx.runMutation(internal.slots.setPublished, {
      id: slot._id,
      platformId: out.mediaId,
    });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "success",
      providerMessage: `Published instagram ${out.mediaId} (${out.via}).`,
    });
    await ctx.runMutation(api.topics.update, { id: draft.topicId, status: "done" });
    return "published";
  }
  if (out.code === "AUTH") {
    await ctx.runMutation(internal.publish.setPublishPausedInternal, {
      paused: true,
      reason: `auth-instagram: ${out.message}`,
    });
    await ctx.runMutation(internal.slots.release, { id: slot._id });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "retryable",
      providerMessage: out.message,
    });
    return "deferred";
  }
  if (!out.retryable) {
    await ctx.runMutation(internal.slots.setFailed, { id: slot._id, error: out.message });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "permanent",
      providerMessage: out.message,
    });
    return "failed";
  }
  if (slot.attempts + 1 >= MAX_ATTEMPTS) {
    await ctx.runMutation(internal.slots.setFailed, {
      id: slot._id,
      error: `Gave up after ${MAX_ATTEMPTS} attempts: ${out.message}`,
    });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "permanent",
      providerMessage: out.message,
    });
    return "failed";
  }
  await ctx.runMutation(internal.slots.release, {
    id: slot._id,
    notBefore: now + backoffMs(slot.attempts + 1),
  });
  await ctx.runMutation(internal.publish.addReceipt, {
    slotId: slot._id,
    attemptedAt: now,
    outcome: "retryable",
    providerMessage: out.message,
  });
  return "deferred";
}

export const setPublishPausedInternal = internalMutation({
  args: { paused: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const value = JSON.stringify({
      paused: args.paused,
      reason: args.reason ?? null,
      at: Date.now(),
    });
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "publishPaused"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", { key: "publishPaused", value, updatedAt: Date.now() });
    }
    return null;
  },
});
