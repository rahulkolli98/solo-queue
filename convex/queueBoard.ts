import type { Id } from "./_generated/dataModel";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { v } from "convex/values";
import { assertFileNotRemoved, refusal } from "./lib/slots";
import { STALE_CLAIM_MESSAGE } from "./slotRecovery";
import { slotRisk } from "./lib/connectionRisk";
import { readSettings } from "./lib/settingsDb";
import { isReelTemplate } from "./lib/queueRules";
import { assertOneReelPerDay, effectiveTz, hasOpenSlot, planNextSlot, reelDays, takenTimes } from "./lib/slotPlanning";
import { dayKey, resolveTz, zonedParts, zonedWallToUtc } from "./lib/zoned";

/**
 * Data and actions for the Queue board: day columns with open slots, the slot
 * drawer (post, media, every publish attempt), retry of failed posts and
 * requeue of published ones.
 */

const DAY_MS = 86400000;
const WEEKDAY_LABEL = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function hhmm(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * One column per local day from `from` for `days` days. Each day lists its
 * slots per platform (any status, so published and failed posts stay
 * visible) and the settings times that are still open. `tz` is the browser
 * zone, used while the saved zone is still "auto".
 */
export const dayColumns = operatorQuery({
  args: { from: v.number(), days: v.optional(v.number()), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const settings = await readSettings(ctx);
    const tz = resolveTz(settings.timezone === "auto" ? args.tz : settings.timezone);
    const span = Math.min(Math.max(args.days ?? 7, 1), 31);
    const end = args.from + (span + 1) * DAY_MS; // slack for DST days
    const todayKey = dayKey(Date.now(), tz);
    const pillarColor = new Map(settings.pillars.map((p) => [p.key, p.color]));

    type Card = {
      _id: Id<"slots">;
      platform: "threads" | "instagram";
      scheduledAt: number;
      time: string;
      status: "scheduled" | "claimed" | "published" | "failed";
      topicTitle: string;
      snippet: string;
      constraintOk: boolean;
      pillarColor: string;
      format: string | null;
      hasMedia: boolean;
      attempts: number;
      lastError: string | null;
      /** Why this scheduled post may not go out (a connection problem), else null. */
      atRisk: string | null;
    };
    const connections = await ctx.db.query("connections").take(10);
    const byDay = new Map<string, { threads: Card[]; instagram: Card[] }>();

    for (const platform of ["threads", "instagram"] as const) {
      // The index is ordered by status first, so read each status over the
      // visible time range; one unbounded read would cut off the newest rows.
      const rows = [];
      for (const status of ["scheduled", "claimed", "published", "failed"] as const) {
        rows.push(
          ...(await ctx.db
            .query("slots")
            .withIndex("by_platform_status_scheduled", (q) =>
              q
                .eq("platform", platform)
                .eq("status", status)
                .gte("scheduledAt", args.from - DAY_MS)
                .lt("scheduledAt", end)
            )
            .take(300))
        );
      }
      for (const slot of rows) {
        const draft = await ctx.db.get(slot.draftId);
        const topic = draft ? await ctx.db.get(draft.topicId) : null;
        const card: Card = {
          _id: slot._id,
          platform,
          scheduledAt: slot.scheduledAt,
          time: hhmm(slot.scheduledAt, tz),
          status: slot.status,
          topicTitle: topic?.title ?? "(deleted topic)",
          snippet: (draft?.body ?? "").split(/^\s*---\s*$/m)[0].trim().slice(0, 140),
          constraintOk: draft?.constraintOk ?? false,
          pillarColor: pillarColor.get(topic?.pillar ?? "build") ?? "pillar-build",
          format: draft?.format ?? null,
          hasMedia: Boolean(draft?.mediaAssetId),
          attempts: slot.attempts,
          lastError: slot.lastError ?? null,
          atRisk: slotRisk(
            platform,
            slot.status,
            slot.scheduledAt,
            connections.find((c) => c.platform === platform)
          ),
        };
        const key = dayKey(slot.scheduledAt, tz);
        const bucket = byDay.get(key) ?? { threads: [], instagram: [] };
        bucket[platform].push(card);
        byDay.set(key, bucket);
      }
    }

    const start = zonedParts(args.from, tz);
    const now = Date.now();
    const days = [];
    for (let i = 0; i < span; i++) {
      const cal = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
      const year = cal.getUTCFullYear();
      const month = cal.getUTCMonth() + 1;
      const day = cal.getUTCDate();
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = (cal.getUTCDay() + 6) % 7;
      const bucket = byDay.get(key) ?? { threads: [], instagram: [] };
      for (const list of [bucket.threads, bucket.instagram]) {
        list.sort((a, b) => a.scheduledAt - b.scheduledAt);
      }
      const open: Record<"threads" | "instagram", string[]> = { threads: [], instagram: [] };
      for (const platform of ["threads", "instagram"] as const) {
        if (!settings.slotDays[platform].includes(weekday)) continue;
        const used = new Set(bucket[platform].map((c) => c.time));
        for (const time of settings.slotDefaults[platform]) {
          const [hour, minute] = time.split(":").map(Number);
          const ts = zonedWallToUtc({ year, month, day, hour, minute }, tz);
          if (ts > now && !used.has(time)) open[platform].push(time);
        }
      }
      days.push({
        key,
        weekday,
        label: `${WEEKDAY_LABEL[weekday]} ${day}`,
        isToday: key === todayKey,
        threads: bucket.threads,
        instagram: bucket.instagram,
        open,
      });
    }
    return { tz, days };
  },
});

/** Everything the slot drawer shows: the post, its topic, its media and every publish attempt. */
export const detail = operatorQuery({
  args: { id: v.id("slots") },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) return null;
    const draft = await ctx.db.get(slot.draftId);
    const topic = draft ? await ctx.db.get(draft.topicId) : null;
    const asset = draft?.mediaAssetId ? await ctx.db.get(draft.mediaAssetId) : null;
    const connection = await ctx.db
      .query("connections")
      .withIndex("by_platform", (q) => q.eq("platform", slot.platform))
      .first();
    const receipts = await ctx.db
      .query("publishReceipts")
      .withIndex("by_slot", (q) => q.eq("slotId", args.id))
      .order("desc")
      .take(20);
    return {
      slot,
      atRisk: slotRisk(slot.platform, slot.status, slot.scheduledAt, connection ?? undefined),
      draft: draft
        ? {
            _id: draft._id,
            platform: draft.platform,
            body: draft.body,
            format: draft.format ?? null,
            constraintOk: draft.constraintOk,
          }
        : null,
      topic: topic ? { _id: topic._id, title: topic.title } : null,
      media: asset
        ? {
            _id: asset._id,
            publicUrl: asset.publicUrl,
            mimeType: asset.mimeType,
            verifiedAt: asset.verifiedAt ?? null,
            lastVerifyError: asset.lastVerifyError ?? null,
            fileRemoved: asset.fileDeletedAt !== undefined,
          }
        : null,
      receipts: receipts.map((r) => ({
        _id: r._id,
        attemptedAt: r.attemptedAt,
        outcome: r.outcome,
        providerMessage: r.providerMessage ?? null,
      })),
    };
  },
});

/**
 * Put a failed slot back in the queue, at `scheduledAt` or the next free
 * slot. Attempts restart at zero; the receipts of earlier attempts stay as
 * history.
 */
export const retry = operatorMutation({
  args: { id: v.id("slots"), scheduledAt: v.optional(v.number()), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have been removed.");
    if (slot.status !== "failed") throw refusal("BAD_STATE", "Only failed posts can be retried.");
    const now = Date.now();
    let at = args.scheduledAt;
    if (at !== undefined && at <= now) throw refusal("BAD_TIME", "Pick a future time for the slot.");
    // "One reel a day" holds for a retried reel too, at the time picked or the next free one.
    const settings = await readSettings(ctx);
    const draft = await ctx.db.get(slot.draftId);
    const reel = draft !== null && isReelTemplate(draft.templateKey) && settings.rules.oneReelPerDay;
    if (at === undefined) {
      try {
        at = await planNextSlot(ctx, slot.platform, await takenTimes(ctx, slot.platform), args.tz, now, {
          rejectDays: reel ? await reelDays(ctx, effectiveTz(settings, args.tz), now, new Set([args.id])) : undefined,
        });
      } catch (err) {
        throw refusal("NO_FREE_SLOT", err instanceof Error ? err.message : "No free slot.");
      }
    } else if (draft) {
      await assertOneReelPerDay(ctx, settings, draft.templateKey, at, args.tz, now, args.id);
    }
    await ctx.db.patch(args.id, {
      status: "scheduled",
      scheduledAt: at,
      attempts: 0,
      lastError: undefined,
      claimedAt: undefined,
      // A failed publish leaves its provider container behind. Resuming it would
      // re-send the old text and media, so drop it; the one exception is a claim
      // the publisher abandoned, where resuming is exactly what is wanted.
      containerId: slot.lastError === STALE_CLAIM_MESSAGE ? slot.containerId : undefined,
    });
    return { slotId: args.id, scheduledAt: at };
  },
});

/** Mark a post as evergreen: it can be requeued once the rest period has passed. */
export const setEvergreen = operatorMutation({
  args: { id: v.id("slots"), evergreen: v.boolean() },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have been removed.");
    await ctx.db.patch(args.id, { evergreen: args.evergreen });
    return { slotId: args.id, evergreen: args.evergreen };
  },
});

/**
 * Requeue a published post: a new slot for the same draft at the next free
 * time, with the original kept as history. Allowed once the rest period
 * (settings.rules.evergreenRestDays) has passed since it published.
 */
export const requeue = operatorMutation({
  args: { id: v.id("slots"), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.id);
    if (!slot) throw refusal("SLOT_NOT_FOUND", "Slot not found — it may have been removed.");
    if (slot.status !== "published") {
      throw refusal("BAD_STATE", "Only published posts can be requeued.");
    }
    const settings = await readSettings(ctx);
    const now = Date.now();
    const publishedAt = slot.publishedAt ?? slot.scheduledAt;
    const restMs = settings.rules.evergreenRestDays * DAY_MS;
    if (now - publishedAt < restMs) {
      const left = Math.ceil((restMs - (now - publishedAt)) / DAY_MS);
      throw refusal(
        "REST_PERIOD",
        `Too soon to repost this: ${left} more day${left === 1 ? "" : "s"} of rest.`
      );
    }
    const draft = await ctx.db.get(slot.draftId);
    if (!draft) {
      throw refusal("DRAFT_NOT_FOUND", "The draft behind this post is gone.");
    }
    if (await hasOpenSlot(ctx, slot.draftId)) {
      throw refusal("ALREADY_QUEUED", "This post is already queued again.");
    }
    if (slot.platform === "instagram") {
      const asset = draft.mediaAssetId ? await ctx.db.get(draft.mediaAssetId) : null;
      if (!asset) throw refusal("MEDIA_MISSING", "Attached media is gone — pick another in the Library.");
      assertFileNotRemoved(asset);
    }
    let at: number;
    try {
      at = await planNextSlot(ctx, slot.platform, await takenTimes(ctx, slot.platform), args.tz, now, {
        rejectDays:
          settings.rules.oneReelPerDay && isReelTemplate(draft.templateKey)
            ? await reelDays(ctx, effectiveTz(settings, args.tz), now)
            : undefined,
      });
    } catch (err) {
      throw refusal("NO_FREE_SLOT", err instanceof Error ? err.message : "No free slot.");
    }
    const slotId = await ctx.db.insert("slots", {
      platform: slot.platform,
      draftId: slot.draftId,
      scheduledAt: at,
      status: "scheduled",
      attempts: 0,
      evergreen: true,
      createdAt: now,
    });
    return { slotId, scheduledAt: at };
  },
});
