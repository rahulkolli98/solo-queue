import { mutation, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkEditedBody } from "./lib/drafting";
import {
  VERIFIED_TTL_MS,
  enqueuePayloadSchema,
  nextDailyOccurrence,
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
export const enqueue = mutation({
  args: {
    draftId: v.id("drafts"),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
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
      .filter((q) => q.eq(q.field("draftId"), args.draftId))
      .first();
    if (dupe)
      throw refusal("ALREADY_QUEUED", "This draft is already queued.");

    const now = Date.now();
    let at = args.scheduledAt;
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
      draftId: args.draftId,
      scheduledAt: at,
      status: "scheduled",
      attempts: 0,
      createdAt: now,
    });
    await ctx.db.patch(draft.topicId, { status: "queued" });
    return { slotId, scheduledAt: at };
  },
});
