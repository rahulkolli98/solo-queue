import { mutation, internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { checkEditedBody } from "./lib/drafting";
import {
  VERIFIED_TTL_MS,
  enqueuePayloadSchema,
  nextDailyOccurrence,
  nextFreeSlot,
  normalizeTimes,
  parseRefusal,
  refusal,
} from "./lib/slots";

/** Scheduled (not yet claimed) slots per platform — powers at-risk warnings. */
export const countScheduledByPlatform = query({
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
export const week = query({
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
export const reschedule = mutation({
  args: { id: v.id("slots"), scheduledAt: v.number() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have fired already.");
    if (slot.status !== "scheduled")
      throw refusal("BAD_STATE", "Only scheduled slots can move.");
    if (args.scheduledAt <= Date.now())
      throw refusal("BAD_TIME", "Pick a future time for the slot.");
    await ctx.db.patch(args.id, { scheduledAt: args.scheduledAt });
    return { slotId: args.id, scheduledAt: args.scheduledAt };
  },
});

/**
 * Cancel a scheduled slot. The draft is preserved; the topic drops back to
 * ready unless its other drafts are still queued.
 */
export const cancel = mutation({
  args: { id: v.id("slots") },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have fired already.");
    if (slot.status !== "scheduled")
      throw refusal("BAD_STATE", "Only scheduled slots can be cancelled.");
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
    const asset = draft.mediaAssetId ? await ctx.db.get(draft.mediaAssetId) : null;
    return {
      slot: {
        _id: slot._id,
        platform: slot.platform,
        attempts: slot.attempts,
        scheduledAt: slot.scheduledAt,
      },
      draft: {
        _id: draft._id,
        topicId: draft.topicId,
        platform: draft.platform,
        body: draft.body,
        templateKey: draft.templateKey,
        mediaAssetId: draft.mediaAssetId ?? undefined,
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
  scheduledAt?: number
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

    let mediaUrl: string | undefined;
    if (platform === "instagram") {
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

    const dupe = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        q.eq("platform", platform).eq("status", "scheduled")
      )
      .filter((q) => q.eq(q.field("draftId"), draftId))
      .first();
    if (dupe)
      throw refusal("ALREADY_QUEUED", "This draft is already queued.");

    const now = Date.now();
    let at = scheduledAt;
    if (at !== undefined && at <= now)
      throw refusal("BAD_TIME", "Pick a future time for the slot.");
    if (at === undefined) {
      const row = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", "slotDefaults"))
        .unique();
      let hhmm = platform === "threads" ? "09:00" : "18:00";
      try {
        const parsed = JSON.parse(row?.value ?? "") as Partial<
          Record<"threads" | "instagram", unknown>
        >;
        const cand = parsed[platform];
        if (typeof cand === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(cand))
          hhmm = cand;
      } catch {
        // Corrupt settings row — fall back to the platform default.
      }
      at = nextDailyOccurrence(hhmm, now);
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

export const enqueue = mutation({
  args: {
    draftId: v.id("drafts"),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const res = await doEnqueue(ctx, args.draftId, args.scheduledAt);
    return { slotId: res.slotId, scheduledAt: res.scheduledAt };
  },
});

/**
 * Transactionally claim due slots (scheduledAt <= now), oldest first,
 * capped per call. Single-winner under racing ticks: the status flip and
 * the read happen in one transaction, so two concurrent callers racing over
 * the same rows resolve to disjoint winners (the loser retries against the
 * already-claimed rows and moves on).
 */
export const claimDue = mutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Id<"slots">[]> => {
    const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const due: { _id: Id<"slots">; scheduledAt: number }[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled").lte("scheduledAt", args.now)
        )
        .take(cap);
      for (const r of rows) due.push({ _id: r._id, scheduledAt: r.scheduledAt });
    }
    due.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const winners = due.slice(0, cap);
    for (const w of winners) {
      await ctx.db.patch(w._id, { status: "claimed" });
    }
    return winners.map((w) => w._id);
  },
});

/**
 * Return a claimed slot to scheduled (manual retry / drill restore).
 * Bumps attempts so the tick's backoff accounting stays truthful.
 */
export const release = mutation({
  args: { id: v.id("slots"), notBefore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found.");
    if (slot.status !== "claimed")
      throw refusal("BAD_STATE", "Only claimed slots can be released.");
    const at = Math.max(slot.scheduledAt, args.notBefore ?? slot.scheduledAt);
    await ctx.db.patch(args.id, {
      status: "scheduled",
      scheduledAt: at,
      attempts: slot.attempts + 1,
    });
    return { slotId: args.id, scheduledAt: at, attempts: slot.attempts + 1 };
  },
});

/** Queueable formats for the one-gesture flow, in lane order. */
const WEEK_FORMATS = [
  { templateKey: "threads-hook-story", label: "Threads", platform: "threads" },
  { templateKey: "ig-caption-beats", label: "IG caption", platform: "instagram" },
  { templateKey: "reel-script", label: "IG reel", platform: "instagram" },
] as const;

/**
 * One-gesture "queue this week": assign every queueable draft of a topic to
 * its next free slot. Best-effort per draft — refusals land in `skipped`
 * with their VALIDATION code/message instead of failing the batch.
 */
export const queueTopic = mutation({
  args: { topicId: v.id("topics") },
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
      threads: [],
      instagram: [],
    };
    for (const platform of ["threads", "instagram"] as const) {
      const rows = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "scheduled")
        )
        .take(200);
      taken[platform] = rows.map((r) => r.scheduledAt);
    }

    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "slotDefaults"))
      .unique();
    let raw: Partial<Record<"threads" | "instagram", unknown>> = {};
    try {
      raw = JSON.parse(row?.value ?? "{}") as Partial<
        Record<"threads" | "instagram", unknown>
      >;
    } catch {
      // Corrupt settings row — per-platform fallbacks below.
    }

    const now = Date.now();
    const queued: { format: string; templateKey: string; scheduledAt: number }[] = [];
    const skipped: { format: string; templateKey: string; code: string; message: string }[] = [];
    for (const f of WEEK_FORMATS) {
      const draft = latestByKey.get(f.templateKey);
      if (!draft) {
        skipped.push({
          format: f.label,
          templateKey: f.templateKey,
          code: "NO_DRAFT",
          message: `No ${f.label.toLowerCase()} draft yet — generate one first.`,
        });
        continue;
      }
      try {
        const times = normalizeTimes(
          raw[f.platform],
          f.platform === "threads" ? "09:00" : "18:00"
        );
        const at = nextFreeSlot(times, now, taken[f.platform]);
        await doEnqueue(ctx, draft._id, at);
        taken[f.platform].push(at);
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
