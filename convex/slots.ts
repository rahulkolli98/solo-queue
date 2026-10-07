import { internalMutation, internalQuery } from "./_generated/server";
import { operatorMutation, operatorQuery } from "./lib/operator";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { loadCarouselAssets } from "./lib/carouselMedia";
import { checkEditedBody, hasPlaceholder, MAX_THREAD_POSTS, splitPosts } from "./lib/drafting";
import {
  VERIFIED_TTL_MS,
  assertFileNotRemoved,
  enqueuePayloadSchema,
  parseRefusal,
  refusal,
} from "./lib/slots";
import {
  assertOneReelPerDay,
  assertUnderDailyCap,
  effectiveTz,
  planNextSlot,
  planSlot,
  reelDays,
  scheduledPillars,
  takenTimes,
} from "./lib/slotPlanning";
import { isHeldByNaturalTiming } from "./lib/queueHold";
import { readHold } from "./lib/queueHoldDb";
import { isReelTemplate, pillarOf, type QueuedPillar } from "./lib/queueRules";
import { dayKey } from "./lib/zoned";
import { readSettings } from "./lib/settingsDb";

/** Scheduled (not yet claimed) slots per platform — powers at-risk warnings. */
export const countScheduledByPlatform = operatorQuery({
  args: { platform: v.union(v.literal("threads"), v.literal("instagram")) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        q.eq("platform", args.platform).eq("status", "scheduled")
      )
      .collect();
    return rows.length;
  },
});

/**
 * Week view feed: scheduled slots in [from, from + days) with the draft
 * snippet + topic title each card needs. Bounded — the week view never
 * needs more than a screenful.
 */
export const week = operatorQuery({
  args: { from: v.number(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const span = Math.min(Math.max(args.days ?? 7, 1), 31) * 86400000;
    const end = args.from + span;
    const out: {
      _id: string;
      platform: "threads" | "instagram";
      draftId: string;
      scheduledAt: number;
      topicTitle: string;
      snippet: string;
      constraintOk: boolean;
    }[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled")
        )
        .take(100);
      for (const slot of rows) {
        if (slot.scheduledAt < args.from || slot.scheduledAt >= end) continue;
        const draft = await ctx.db.get(slot.draftId);
        const topic = draft ? await ctx.db.get(draft.topicId) : null;
        out.push({
          _id: slot._id,
          platform,
          draftId: slot.draftId,
          scheduledAt: slot.scheduledAt,
          topicTitle: topic?.title ?? "(deleted topic)",
          snippet: (draft?.body ?? "").slice(0, 140),
          constraintOk: draft?.constraintOk ?? false,
        });
      }
    }
    out.sort((a, b) => a.scheduledAt - b.scheduledAt);
    return out;
  },
});

/** Move a scheduled slot to a new future time. */
export const reschedule = operatorMutation({
  args: { id: v.id("slots"), scheduledAt: v.number(), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have fired already.");
    if (slot.status !== "scheduled")
      throw refusal("BAD_STATE", "Only scheduled slots can move.");
    if (args.scheduledAt <= Date.now())
      throw refusal("BAD_TIME", "Pick a future time for the slot.");
    // The slot may move to any time no other post on this platform already holds (its own old time is free).
    const others = await takenTimes(ctx, slot.platform);
    const own = others.indexOf(slot.scheduledAt);
    if (own >= 0) others.splice(own, 1);
    if (others.includes(args.scheduledAt)) {
      throw refusal("SLOT_TAKEN", "Another post is already set for that time. Pick a different time.");
    }
    const draft = await ctx.db.get(slot.draftId);
    if (draft) {
      await assertOneReelPerDay(
        ctx,
        await readSettings(ctx),
        draft.templateKey,
        args.scheduledAt,
        args.tz,
        Date.now(),
        args.id
      );
    }
    await ctx.db.patch(args.id, { scheduledAt: args.scheduledAt });
    return { slotId: args.id, scheduledAt: args.scheduledAt };
  },
});

/**
 * Cancel a scheduled or failed slot. The draft is preserved; the topic drops
 * back to ready unless its other drafts are still queued. Cancelling a failed
 * post is how the founder clears the "pause on failure" hold without retrying.
 */
export const cancel = operatorMutation({
  args: { id: v.id("slots") },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have fired already.");
    if (slot.status !== "scheduled" && slot.status !== "failed")
      throw refusal("BAD_STATE", "Only scheduled or failed posts can be cancelled.");
    const draft = await ctx.db.get(slot.draftId);
    await ctx.db.delete(args.id);
    if (draft) {
      const topicDrafts = (
        await Promise.all(
          (["threads", "instagram", "blog"] as const).map((platform) =>
            ctx.db
              .query("drafts")
              .withIndex("by_topic_platform", (q) =>
                q.eq("topicId", draft.topicId).eq("platform", platform)
              )
              .collect()
          )
        )
      ).flat();
      const ids = new Set(topicDrafts.map((d) => d._id));
      let stillQueued = false;
      for (const platform of ["threads", "instagram"] as const) {
        const rows = await ctx.db
          .query("slots")
          .withIndex("by_platform_status_scheduled", (q) =>
            q.eq("platform", platform).eq("status", "scheduled")
          )
          .take(200);
        if (rows.some((s) => ids.has(s.draftId))) {
          stillQueued = true;
          break;
        }
      }
      if (!stillQueued) await ctx.db.patch(draft.topicId, { status: "ready" });
    }
    return null;
  },
});

/**
 * Hydrate claimed slots for the publisher tick (actions can't touch ctx.db).
 * Returns null for slots that vanished mid-tick — the tick skips those.
 */
export const getForPublish = internalQuery({
  args: { id: v.id("slots") },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot || slot.status !== "claimed") return null;
    const draft = await ctx.db.get(slot.draftId);
    if (!draft) return null;
    const topic = await ctx.db.get(draft.topicId);
    const storedAsset = draft.mediaAssetId ? await ctx.db.get(draft.mediaAssetId) : null;
    // A file the cleanup removed cannot be published: treat it like missing media.
    const asset = storedAsset && storedAsset.fileDeletedAt === undefined ? storedAsset : null;
    // A carousel of two or more slides posts every slide image, in order; one slide posts as a single image.
    const slideCount = draft.slides?.length;
    let slideAssets: { publicUrl: string; mimeType: string }[] | undefined;
    if (slideCount !== undefined && slideCount > 1) {
      const docs = await Promise.all((draft.mediaAssetIds ?? []).map((id) => ctx.db.get(id)));
      slideAssets = docs
        .filter((d): d is NonNullable<typeof d> => d !== null && d.fileDeletedAt === undefined)
        .map((d) => ({ publicUrl: d.publicUrl, mimeType: d.mimeType }));
    }
    return {
      slot: {
        _id: slot._id,
        platform: slot.platform,
        attempts: slot.attempts,
        scheduledAt: slot.scheduledAt,
        containerId: slot.containerId,
      },
      draft: {
        _id: draft._id,
        topicId: draft.topicId,
        platform: draft.platform,
        body: draft.body,
        templateKey: draft.templateKey,
        mediaAssetId: draft.mediaAssetId ?? undefined,
        slideCount,
        slideAssets,
      },
      asset: asset
        ? {
            publicUrl: asset.publicUrl,
            mimeType: asset.mimeType,
            verifiedAt: asset.verifiedAt ?? undefined,
          }
        : null,
      topicTitle: topic?.title ?? "(deleted topic)",
    };
  },
});

/** Mark a claimed slot published (tick success path). */
export const setPublished = internalMutation({
  args: { id: v.id("slots"), platformId: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw new Error("Slot not found.");
    await ctx.db.patch(args.id, {
      status: "published",
      publishedPlatformId: args.platformId,
      publishedAt: Date.now(),
      attempts: slot.attempts + 1,
    });
    return null;
  },
});

/** Mark a claimed slot failed with the terminal reason (tick failure path). */
export const setFailed = internalMutation({
  args: { id: v.id("slots"), error: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw new Error("Slot not found.");
    await ctx.db.patch(args.id, {
      status: "failed",
      lastError: args.error.slice(0, 500),
      attempts: slot.attempts + 1,
    });
    return null;
  },
});

/**
 * DEV-ONLY drill helper: insert a coherent topic → draft → scheduled slot
 * chain to verify at-risk warnings. Never call from UI code.
 */export const drillInsertSlot = internalMutation({
  args: {
    platform: v.union(v.literal("threads"), v.literal("instagram")),
    scheduledAt: v.number(),
  },
  handler: async (ctx, args) => {
    const topicId = await ctx.db.insert("topics", {
      title: "Drill topic (dev only)",
      status: "queued",
      createdAt: Date.now(),
    });
    const draftId = await ctx.db.insert("drafts", {
      topicId,
      platform: args.platform,
      body: "Drill draft (dev only).",
      templateKey: "drill",
      templateVersion: 0,
      charCount: 24,
      constraintOk: true,
      createdAt: Date.now(),
    });
    return await ctx.db.insert("slots", {
      platform: args.platform,
      draftId,
      scheduledAt: args.scheduledAt,
      status: "scheduled",
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});

/**
 * Queue a draft for publishing. Every refusal throws `VALIDATION:<CODE>:
 * <message>` (see lib/slots refusal/parseRefusal) so the UI can switch on
 * the code and show the message verbatim.
 *
 * Checks, in order: draft exists → platform queueable → within platform
 * limits → IG media attached + verified + fresh → not already queued →
 * future slot time → zod payload shape. Then inserts the slot and marks the
 * topic queued.
 */
async function doEnqueue(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  scheduledAt?: number,
  tz?: string
): Promise<{
  slotId: Id<"slots">;
  scheduledAt: number;
  platform: "threads" | "instagram";
  templateKey: string;
}> {
    const draft = await ctx.db.get(draftId);
    if (!draft)
      throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been deleted.");
    const platform = draft.platform;
    if (platform === "blog")
      throw refusal(
        "UNSUPPORTED_PLATFORM",
        "Blog drafts don't queue — publishing runs per platform."
      );

    if (platform === "threads" && splitPosts(draft.body).length > MAX_THREAD_POSTS) {
      throw refusal(
        "TOO_MANY_POSTS",
        `This thread has ${splitPosts(draft.body).length} posts. The most one thread can have is ${MAX_THREAD_POSTS}.`
      );
    }
    const check = checkEditedBody(platform, draft.templateKey, draft.body);
    if (!check.constraintOk) {
      if (platform === "threads")
        throw refusal(
          "OVER_LIMIT",
          `Threads draft is ${check.charCount - 500} chars over the 500-per-post limit — shorten it to queue.`
        );
      throw refusal(
        "OVER_LIMIT",
        `IG caption is ${check.charCount - 2200} chars over the 2,200 limit — shorten it to queue.`
      );
    }

    if (hasPlaceholder(draft.body))
      throw refusal(
        "PLACEHOLDER",
        "This draft still has a [[placeholder]] to fill in. Replace or delete it before queueing."
      );

    let mediaUrl: string | undefined;
    if (platform === "instagram" && draft.slides) {
      // A carousel needs a fresh, reachable image for every slide; the cover is its payload URL.
      const assets = await loadCarouselAssets(ctx, draft);
      mediaUrl = assets[0].publicUrl;
    } else if (platform === "instagram") {
      if (!draft.mediaAssetId)
        throw refusal(
          "MEDIA_REQUIRED",
          "IG drafts need a photo or video — attach media in the Library first."
        );
      const asset = await ctx.db.get(draft.mediaAssetId);
      if (!asset)
        throw refusal(
          "MEDIA_MISSING",
          "Attached media is gone — pick another in the Library."
        );
      assertFileNotRemoved(asset);
      if (!asset.verifiedAt)
        throw refusal(
          "MEDIA_UNVERIFIED",
          "Media URL isn't verified — verify it in the Library first."
        );
      if (Date.now() - asset.verifiedAt > VERIFIED_TTL_MS)
        throw refusal(
          "MEDIA_STALE",
          "Media verification is stale — re-verify it in the Library."
        );
      mediaUrl = asset.publicUrl;
    }

    const existing = await ctx.db
      .query("slots")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .take(100);
    if (existing.some((s) => s.status === "scheduled" || s.status === "claimed"))
      throw refusal("ALREADY_QUEUED", "This draft is already queued.");
    if (existing.some((s) => s.status === "published"))
      throw refusal(
        "ALREADY_PUBLISHED",
        "This draft already went out — repost it from the Library, or write a new draft."
      );
    if (existing.some((s) => s.status === "failed"))
      throw refusal(
        "ALREADY_FAILED",
        "This draft has a failed post — retry or cancel it from the Queue first."
      );

    const now = Date.now();
    let at = scheduledAt;
    if (at !== undefined && at <= now)
      throw refusal("BAD_TIME", "Pick a future time for the slot.");
    const settings = await readSettings(ctx);
    const zone = effectiveTz(settings, tz);
    const reel = isReelTemplate(draft.templateKey) && settings.rules.oneReelPerDay;
    if (at === undefined) {
      try {
        at = await planNextSlot(ctx, platform, await takenTimes(ctx, platform), tz, now, {
          rejectDays: reel ? await reelDays(ctx, zone, now) : undefined,
        });
      } catch (err) {
        throw refusal(
          "NO_FREE_SLOT",
          err instanceof Error ? err.message : "No free slot in the next year."
        );
      }
    } else {
      // A time the caller chose (or queueTopic planned): the rules still hold.
      const taken = await takenTimes(ctx, platform);
      // Two posts at the same minute on one platform would be one slot with two owners.
      if (taken.includes(at)) throw refusal("SLOT_TAKEN", "Another post is already set for that time. Pick a different time.");
      assertUnderDailyCap(settings, platform, taken, at, zone);
      await assertOneReelPerDay(ctx, settings, draft.templateKey, at, tz, now);
    }

    const payload = enqueuePayloadSchema.safeParse({
      platform,
      text: draft.body,
      mediaUrl,
      scheduledAt: at,
    });
    if (!payload.success)
      throw refusal(
        "PAYLOAD_INVALID",
        `Publish payload invalid: ${payload.error.issues[0]?.message ?? "unknown"}.`
      );

    const slotId = await ctx.db.insert("slots", {
      platform,
      draftId,
      scheduledAt: at,
      status: "scheduled",
      attempts: 0,
      createdAt: now,
    });
    await ctx.db.patch(draft.topicId, { status: "queued" });
    return { slotId, scheduledAt: at, platform, templateKey: draft.templateKey };
}

export const enqueue = operatorMutation({
  args: {
    draftId: v.id("drafts"),
    scheduledAt: v.optional(v.number()),
    /** IANA zone from the browser; used when the saved time zone is still "auto". */
    tz: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const res = await doEnqueue(ctx, args.draftId, args.scheduledAt, args.tz);
    return { slotId: res.slotId, scheduledAt: res.scheduledAt };
  },
});

/**
 * Transactionally claim due slots (scheduledAt <= now), oldest first,
 * capped per call. Internal: the publisher tick is the only caller (a public
 * claim would let anyone strand slots in "claimed"). Single-winner under
 * racing ticks: the status flip and the read happen in one transaction, so
 * two concurrent callers racing over the same rows resolve to disjoint
 * winners (the loser retries against the already-claimed rows and moves on).
 */
export const claimDue = internalMutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Id<"slots">[]> => {
    const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
    // Read in the same transaction as the claim, so a hold cannot slip between the check and the claim.
    const hold = await readHold(ctx, args.now);
    if (hold.reason) return [];
    const due: { _id: Id<"slots">; scheduledAt: number }[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled").lte("scheduledAt", args.now)
        )
        .take(cap);
      for (const r of rows) {
        // Natural timing: a first attempt waits its small fixed delay (never early, under 2 minutes).
        if (isHeldByNaturalTiming(r, hold.settings.naturalTiming, args.now)) continue;
        due.push({ _id: r._id, scheduledAt: r.scheduledAt });
      }
    }
    due.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const winners = due.slice(0, cap);
    for (const w of winners) {
      await ctx.db.patch(w._id, { status: "claimed", claimedAt: args.now });
    }
    return winners.map((w) => w._id);
  },
});

/**
 * Return a claimed slot to scheduled (manual retry / drill restore).
 * Bumps attempts so the tick's backoff accounting stays truthful.
 */
export const release = internalMutation({
  args: {
    id: v.id("slots"),
    notBefore: v.optional(v.number()),
    /** false for a deferral that is not a failed attempt (rate-limit guard). Default true. */
    countAttempt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have been removed.");
    if (slot.status !== "claimed")
      throw refusal("BAD_STATE", "Only claimed slots can be released.");
    const at = Math.max(slot.scheduledAt, args.notBefore ?? slot.scheduledAt);
    const attempts = slot.attempts + (args.countAttempt === false ? 0 : 1);
    await ctx.db.patch(args.id, {
      status: "scheduled",
      scheduledAt: at,
      attempts,
      claimedAt: undefined,
      // Keep the time the founder chose; scheduledAt now means "next attempt".
      originalScheduledAt:
        at !== slot.scheduledAt ? (slot.originalScheduledAt ?? slot.scheduledAt) : slot.originalScheduledAt,
    });
    return { slotId: args.id, scheduledAt: at, attempts };
  },
});

/** Queueable formats for the one-gesture flow, in lane order. */
const WEEK_FORMATS = [
  { templateKey: "threads-hook-story", label: "Threads", platform: "threads" },
  { templateKey: "ig-caption-beats", label: "IG caption", platform: "instagram" },
  { templateKey: "reel-script", label: "IG reel", platform: "instagram" },
] as const;

const CAROUSEL_FORMAT = { templateKey: "carousel-slides", label: "IG carousel", platform: "instagram" } as const;

/**
 * One-gesture "queue this week": assign every queueable draft of a topic to
 * its next free slot. Best-effort per draft — refusals land in `skipped`
 * with their VALIDATION code/message instead of failing the batch.
 */
export const queueTopic = operatorMutation({
  args: { topicId: v.id("topics"), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic)
      throw refusal("TOPIC_NOT_FOUND", "Topic not found — it may have been deleted.");

    const all = (
      await Promise.all(
        (["threads", "instagram", "blog"] as const).map((platform) =>
          ctx.db
            .query("drafts")
            .withIndex("by_topic_platform", (q) =>
              q.eq("topicId", args.topicId).eq("platform", platform)
            )
            .collect()
        )
      )
    ).flat();
    // Index scans come back oldest-first, so the last write per key wins.
    const latestByKey = new Map<string, (typeof all)[number]>();
    for (const d of all) latestByKey.set(d.templateKey, d);

    const taken: Record<"threads" | "instagram", number[]> = {
      threads: await takenTimes(ctx, "threads"),
      instagram: await takenTimes(ctx, "instagram"),
    };

    const now = Date.now();
    const settings = await readSettings(ctx);
    const zone = effectiveTz(settings, args.tz);
    // "Mix pillars": the scheduled queue per platform with each post's pillar, grown as this call places posts.
    const pillar = pillarOf(topic.pillar);
    const queue: Record<"threads" | "instagram", QueuedPillar[]> = settings.rules.mixPillars
      ? { threads: await scheduledPillars(ctx, "threads"), instagram: await scheduledPillars(ctx, "instagram") }
      : { threads: [], instagram: [] };
    // "One reel a day": local days that already hold a reel, grown as this call places one.
    const reelDaysTaken = settings.rules.oneReelPerDay ? await reelDays(ctx, zone, now) : new Set<string>();
    const queued: { format: string; templateKey: string; scheduledAt: number }[] = [];
    const skipped: { format: string; templateKey: string; code: string; message: string }[] = [];
    // A carousel is queued with the week only when the topic has one (most topics do not).
    const formats = latestByKey.has(CAROUSEL_FORMAT.templateKey) ? [...WEEK_FORMATS, CAROUSEL_FORMAT] : WEEK_FORMATS;
    for (const f of formats) {
      const draft = latestByKey.get(f.templateKey);
      if (!draft) {
        skipped.push({
          format: f.label,
          templateKey: f.templateKey,
          code: "NO_DRAFT",
          message: "No draft yet — generate one first.",
        });
        continue;
      }
      try {
        const rejectDays =
          settings.rules.oneReelPerDay && isReelTemplate(f.templateKey) ? reelDaysTaken : undefined;
        let at: number;
        try {
          at = planSlot(settings, f.platform, taken[f.platform], zone, now, {
            rejectDays,
            mix: settings.rules.mixPillars ? { pillar, queue: queue[f.platform] } : undefined,
          });
        } catch (err) {
          // Mixing is a preference, never a reason to refuse: with no mixed slot in reach, take the first free one.
          if (!settings.rules.mixPillars) throw err;
          at = planSlot(settings, f.platform, taken[f.platform], zone, now, { rejectDays });
        }
        await doEnqueue(ctx, draft._id, at, args.tz);
        taken[f.platform].push(at);
        queue[f.platform].push({ at, pillar });
        if (rejectDays) reelDaysTaken.add(dayKey(at, zone));
        queued.push({ format: f.label, templateKey: f.templateKey, scheduledAt: at });
      } catch (err) {
        const r = parseRefusal(err);
        if (r) {
          skipped.push({ format: f.label, templateKey: f.templateKey, code: r.code, message: r.message });
        } else if (err instanceof Error && err.message.startsWith("No free slot")) {
          skipped.push({
            format: f.label,
            templateKey: f.templateKey,
            code: "NO_FREE_SLOT",
            message: "No free slot in the next year — clear some queue first.",
          });
        } else {
          throw err;
        }
      }
    }
    return { queued, skipped };
  },
});
