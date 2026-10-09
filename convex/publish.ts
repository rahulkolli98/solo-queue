import { v } from "convex/values";
import { operatorQuery } from "./lib/operator";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { hasPlaceholder, instagramCaption, splitPosts, stripBeatHeaders } from "./lib/drafting";
import { isLivePublishing } from "./lib/safety";
import { isHeldByNaturalTiming, type HoldReason } from "./lib/queueHold";
import { readHold } from "./lib/queueHoldDb";
import { readSettings } from "./lib/settingsDb";
import { publishReplyWithRetry } from "./lib/threadReplies";
import {
  publishInstagramPost,
  resumeInstagramContainer,
  type InstagramKind,
} from "./providers/instagram";
import {
  publishThreadsPost,
  resumeThreadsContainer,
  type ThreadsMediaType,
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

/**
 * Why the queue is holding right now ("vacation", "failure") or null. Read by
 * the tick for its dry run and logs; `slots.claimDue` makes the same check
 * itself, inside its own transaction.
 */
export const currentHold = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<{ reason: HoldReason; vacationUntil: number | null }> => {
    const { reason, vacationUntil } = await readHold(ctx, args.now);
    return { reason, vacationUntil };
  },
});

/** Due slots without claiming (dry-run reader — never writes). Honors natural timing, as a claim would. */
export const listDue = internalQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const naturalTiming = (await readSettings(ctx)).naturalTiming;
    const due: { _id: string; platform: string; scheduledAt: number }[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled").lte("scheduledAt", args.now)
        )
        .take(cap);
      for (const r of rows) {
        if (isHeldByNaturalTiming(r, naturalTiming, args.now)) continue;
        due.push({ _id: r._id, platform, scheduledAt: r.scheduledAt });
      }
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
export const countsByDay = operatorQuery({
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
  /** Set when a vacation or an unresolved failure kept the queue from claiming anything this tick. */
  hold?: "vacation" | "failure";
}

function holdMessage(hold: { reason: HoldReason; vacationUntil: number | null }): string {
  if (hold.reason === "vacation") {
    return `holding for vacation${hold.vacationUntil ? ` until ${new Date(hold.vacationUntil).toISOString()}` : ""}`;
  }
  return "holding because a post failed (retry or cancel it)";
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

    const hold = await ctx.runQuery(internal.publish.currentHold, { now });

    if (isDryRun()) {
      const due = hold.reason ? [] : await ctx.runQuery(internal.publish.listDue, { now, limit: 10 });
      const counts = await ctx.runQuery(internal.publish.successCounts24h, { now });
      if (hold.reason) {
        console.log(`publish.tick DRY RUN: ${holdMessage(hold)} — nothing would be claimed.`);
      }
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
        ...(hold.reason ? { hold: hold.reason } : {}),
      };
    }

    // A claim that never finished (crash, timeout) is failed loudly, never retried blind.
    await ctx.runMutation(internal.slotRecovery.reapStaleClaims, { now });

    if (hold.reason) console.log(`publish.tick: ${holdMessage(hold)} — claiming nothing.`);
    // claimDue re-checks the hold in its own transaction, so this read is only for the log and result.
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
          countAttempt: false, // a deferral is not a failed attempt
        });
        console.log(
          `publish.tick: rolling limit hit for ${slot.platform} (${used}/${cap}) — deferred ${slot._id}.`
        );
        limited += 1;
        continue;
      }

      const outcome = await publishGuarded(ctx, slot, draft, asset, topicTitle);
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
    return {
      claimed: ids.length,
      published,
      failed,
      limited,
      paused: false,
      dryRun: false,
      ...(hold.reason ? { hold: hold.reason } : {}),
    };
  },
});

type PublishItem = {
  slot: {
    _id: Id<"slots">;
    platform: "threads" | "instagram";
    attempts: number;
    scheduledAt: number;
    containerId?: string;
  };
  draft: {
    _id: Id<"drafts">;
    topicId: Id<"topics">;
    platform: "threads" | "instagram" | "blog";
    body: string;
    templateKey: string;
    mediaAssetId?: Id<"mediaAssets">;
    /** A carousel: how many slides it has, and the images of those slides in order (two or more slides only). */
    slideCount?: number;
    slideAssets?: { publicUrl: string; mimeType: string }[];
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
  if (hasPlaceholder(draft.body)) {
    return markPermanent(ctx, slot._id, now, "The draft still has a [[placeholder]]. Fill it in, then retry.");
  }

  if (slot.platform === "threads") {
    const conn = await ctx.runQuery(internal.connections.getOne, { platform: "threads" });
    if (!conn) return markPermanent(ctx, slot._id, now, "No Threads connection — reconnect in Settings.");
    // A carousel of two or more slides posts every slide image with its one text (no replies); a one-slide
    // carousel is an ordinary image post. A thread posts its first post as the slot, the rest as replies to it.
    const carousel = draft.slideCount !== undefined && draft.slideCount > 1;
    if (carousel && (draft.slideAssets?.length ?? 0) !== draft.slideCount) {
      return markPermanent(ctx, slot._id, now, "A slide image is gone — draw the slides again, then queue the carousel again.");
    }
    // Media the founder attached to a thread goes on its first post only. A file that is gone is a permanent failure.
    if (!carousel && draft.mediaAssetId && !asset) {
      return markPermanent(ctx, slot._id, now, "Attached media is gone — pick another in the Library, or remove it from the thread.");
    }
    const posts = carousel ? [draft.body.trim()] : splitPosts(stripBeatHeaders(draft.body));
    const text = (posts.length > 0 ? posts[0] : draft.body).trim();
    // A carousel's text is optional on Threads; a thread's first post is not.
    if (!text && !carousel) return markPermanent(ctx, slot._id, now, "Threads draft is empty after splitting posts. Write the post, then retry.");
    if (text.length > THREADS_POST_LIMIT) {
      return markPermanent(ctx, slot._id, now, `Post 1 is ${text.length - THREADS_POST_LIMIT} characters over the ${THREADS_POST_LIMIT} cap — shorten it, then retry.`);
    }
    const mediaType: ThreadsMediaType = carousel ? "CAROUSEL" : asset ? (asset.mimeType.toLowerCase().startsWith("video/") ? "VIDEO" : "IMAGE") : "TEXT";
    const out = slot.containerId
      ? await resumeThreadsContainer({
          userId: conn.platformUserId,
          accessToken: conn.accessToken,
          containerId: slot.containerId,
          mediaType,
        })
      : await publishThreadsPost({
          userId: conn.platformUserId,
          accessToken: conn.accessToken,
          text,
          mediaType,
          mediaUrl: mediaType === "IMAGE" || mediaType === "VIDEO" ? asset!.publicUrl : undefined,
          mimeType: mediaType === "IMAGE" || mediaType === "VIDEO" ? asset!.mimeType : undefined,
          mediaItems: carousel ? draft.slideAssets!.map((a) => ({ url: a.publicUrl, mimeType: a.mimeType })) : undefined,
        });
    if (!out.ok && out.containerId) {
      await ctx.runMutation(internal.slotRecovery.setContainer, { id: slot._id, containerId: out.containerId });
    }
    const result = await settleThreadsOutcome(ctx, slot, draft, out, now, topicTitle, "");
    if (result === "published" && out.ok && posts.length > 1) {
      try {
        await publishThreadReplies(ctx, slot._id, conn, posts.slice(1), out.mediaId);
      } catch (err) {
        // The first post is live; never let a reply error turn into a retry of the slot.
        console.error(`publish.tick: ${slot._id} replies threw — ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
    return result;
  }

  // instagram
  const conn = await ctx.runQuery(internal.connections.getOne, { platform: "instagram" });
  if (!conn) return markPermanent(ctx, slot._id, now, "No Instagram connection — reconnect in Settings.");
  // A carousel of two or more slides posts every slide image; a one-slide carousel is an ordinary image post.
  const carousel = draft.slideCount !== undefined && draft.slideCount > 1;
  if (carousel && (draft.slideAssets?.length ?? 0) !== draft.slideCount) {
    return markPermanent(ctx, slot._id, now, "A slide image is gone — draw the slides again, then queue the carousel again.");
  }
  if (!carousel && !asset) return markPermanent(ctx, slot._id, now, "Attached media is gone — pick another in the Library.");
  const kind: InstagramKind = carousel ? "carousel" : draft.templateKey === "reel-script" ? "reel" : "photo";
  const out = slot.containerId
    ? await resumeInstagramContainer({
        igUserId: conn.platformUserId,
        accessToken: conn.accessToken,
        containerId: slot.containerId,
      })
    : await publishInstagramPost({
        igUserId: conn.platformUserId,
        accessToken: conn.accessToken,
        caption: instagramCaption(draft.templateKey, draft.body),
        mediaUrl: carousel ? draft.slideAssets![0].publicUrl : asset!.publicUrl,
        mimeType: carousel ? draft.slideAssets![0].mimeType : asset!.mimeType,
        kind,
        mediaItems: carousel ? draft.slideAssets!.map((a) => ({ url: a.publicUrl, mimeType: a.mimeType })) : undefined,
      });
  if (!out.ok && out.containerId) {
    await ctx.runMutation(internal.slotRecovery.setContainer, { id: slot._id, containerId: out.containerId });
  }
  return await settleInstagramOutcome(ctx, slot, draft, out, now);
}

const THREADS_POST_LIMIT = 500;

/** Test knob: REPLY_RETRY_DELAYS_MS="1,1,1" shortens the waits between reply attempts. Unset in production. */
function retryDelaysFromEnv(): number[] | undefined {
  const raw = process.env.REPLY_RETRY_DELAYS_MS;
  if (!raw) return undefined;
  const list = raw.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return list.length > 0 ? list : undefined;
}

/**
 * Publish posts 2..N of a thread as replies, each to the one before. The
 * first post is already live, so a failure here never retries the slot (that
 * would post the thread twice): it records which post stopped the chain, as a
 * note on the slot and a receipt, and the founder finishes it by hand.
 */
async function publishThreadReplies(
  ctx: ActionCtx,
  slotId: Id<"slots">,
  conn: { platformUserId: string; accessToken: string },
  rest: string[],
  firstMediaId: string
): Promise<void> {
  let previous = firstMediaId;
  for (let i = 0; i < rest.length; i++) {
    const text = rest[i].trim();
    const number = i + 2;
    const { out, attempts } = await publishReplyWithRetry({
      publish: () =>
        publishThreadsPost({
          userId: conn.platformUserId,
          accessToken: conn.accessToken,
          text,
          mediaType: "TEXT",
          replyToId: previous,
        }),
      resume: (containerId) =>
        resumeThreadsContainer({
          userId: conn.platformUserId,
          accessToken: conn.accessToken,
          containerId,
          mediaType: "TEXT",
        }),
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      delays: retryDelaysFromEnv(),
    });
    if (attempts > 1) {
      console.log(`publish.tick: thread reply ${number} of ${rest.length + 1} took ${attempts} attempts (${out.ok ? "published" : "gave up"}).`);
    }
    if (!out.ok) {
      const tried = attempts > 1 ? ` after ${attempts} tries` : "";
      const live = number - 1 === 1 ? "Post 1 is live." : `Posts 1 to ${number - 1} are live.`;
      const note = `Post ${number} of ${rest.length + 1} did not publish${tried}: ${out.message} ${live} Post the rest by hand.`;
      await ctx.runMutation(internal.slotRecovery.setNote, { id: slotId, note });
      await ctx.runMutation(internal.publish.addReceipt, {
        slotId,
        attemptedAt: Date.now(),
        outcome: "permanent",
        providerMessage: note,
      });
      return;
    }
    previous = out.mediaId;
  }
  await ctx.runMutation(internal.publish.addReceipt, {
    slotId,
    attemptedAt: Date.now(),
    outcome: "success",
    providerMessage: `Published ${rest.length + 1} posts as a thread.`,
  });
}

/**
 * publishOne with a net under it: anything it throws (a network drop, a bug)
 * becomes a retryable failure with a receipt instead of leaving the slot
 * claimed forever.
 */
async function publishGuarded(
  ctx: ActionCtx,
  slot: PublishItem["slot"],
  draft: PublishItem["draft"],
  asset: PublishItem["asset"],
  topicTitle: string
): Promise<"published" | "failed" | "deferred"> {
  try {
    return await publishOne(ctx, slot, draft, asset, topicTitle);
  } catch (err) {
    const message = `Publisher error: ${err instanceof Error ? err.message : "unknown"}.`.slice(0, 300);
    console.error(`publish.tick: ${slot._id} threw — ${message}`);
    const now = Date.now();
    // If the post already went out and a later step threw, the slot is no longer
    // claimed: releasing it would throw and strand the rest of the tick.
    const status = await ctx.runQuery(internal.slotRecovery.statusOf, { id: slot._id });
    if (status === "published") return "published";
    if (status === "failed") return "failed";
    if (status !== "claimed") return "deferred";
    if (slot.attempts + 1 >= MAX_ATTEMPTS) {
      return markPermanent(ctx, slot._id, now, `Gave up after ${MAX_ATTEMPTS} attempts: ${message}`);
    }
    await ctx.runMutation(internal.slots.release, {
      id: slot._id,
      notBefore: now + backoffMs(slot.attempts + 1),
    });
    await ctx.runMutation(internal.publish.addReceipt, {
      slotId: slot._id,
      attemptedAt: now,
      outcome: "retryable",
      providerMessage: message,
    });
    return "deferred";
  }
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
    await ctx.runMutation(internal.topics.markDoneIfComplete, { topicId: draft.topicId });
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
    await ctx.runMutation(internal.topics.markDoneIfComplete, { topicId: draft.topicId });
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
