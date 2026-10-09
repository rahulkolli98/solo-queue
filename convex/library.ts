import type { Doc } from "./_generated/dataModel";
import { operatorQuery } from "./lib/operator";
import { v } from "convex/values";
import { readSettings } from "./lib/settingsDb";

/** What the Library shows: published history and drafts that were never queued. */

const DAY_MS = 86400000;
// The newest this many rows are read before the Library narrows them, so a long history is not cut short too early.
const PAGE = 500;

function firstPost(body: string): string {
  return body.split(/^\s*---\s*$/m)[0].trim();
}

/**
 * Published posts, newest first, each with its pillar, whether it is marked
 * evergreen and whether the rest period allows a requeue yet. `now` is passed
 * in because a query must not read the clock.
 */
export const published = operatorQuery({
  args: {
    now: v.number(),
    pillar: v.optional(v.string()),
    platform: v.optional(v.union(v.literal("threads"), v.literal("instagram"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const settings = await readSettings(ctx);
    const pillars = new Map(settings.pillars.map((p) => [p.key, p]));
    const restMs = settings.rules.evergreenRestDays * DAY_MS;
    const needle = args.search?.trim().toLowerCase();

    const rows = await ctx.db
      .query("slots")
      .withIndex("by_status_and_publishedAt", (q) => q.eq("status", "published"))
      .order("desc")
      .take(PAGE);

    const out = [];
    for (const slot of rows) {
      if (args.platform && slot.platform !== args.platform) continue;
      const draft = await ctx.db.get(slot.draftId);
      if (!draft) continue;
      const topic = await ctx.db.get(draft.topicId);
      const pillarKey = topic?.pillar && pillars.has(topic.pillar) ? topic.pillar : "build";
      if (args.pillar && pillarKey !== args.pillar) continue;
      const linked = draft.carouselDraftId ? await ctx.db.get(draft.carouselDraftId) : null;
      const body = firstPost(draft.body);
      if (needle && !`${body} ${topic?.title ?? ""}`.toLowerCase().includes(needle)) continue;
      const publishedAt = slot.publishedAt ?? slot.scheduledAt;
      const restLeftMs = Math.max(0, publishedAt + restMs - args.now);
      const pillar = pillars.get(pillarKey);
      out.push({
        slotId: slot._id,
        draftId: draft._id,
        topicId: draft.topicId,
        platform: slot.platform,
        publishedAt,
        topicTitle: topic?.title ?? "(deleted topic)",
        body,
        format: draft.format ?? null,
        slideCount: draft.slides?.length ?? linked?.slides?.length ?? null,
        pillarKey,
        pillarName: pillar?.name ?? "Build in public",
        pillarColor: pillar?.color ?? "pillar-build",
        evergreen: slot.evergreen === true,
        canRequeue: restLeftMs === 0,
        restDaysLeft: Math.ceil(restLeftMs / DAY_MS),
      });
    }
    return out;
  },
});

export type DraftStatus = "OVER_LIMIT" | "NEEDS_MEDIA" | "SAVED" | "BLOG";

/** Why a draft is (not) ready: over the limit, Instagram without media, a plain saved draft, or the blog draft. */
export function draftStatus(draft: Pick<Doc<"drafts">, "platform" | "constraintOk" | "mediaAssetId">): DraftStatus {
  if (draft.platform === "blog") return "BLOG";
  if (!draft.constraintOk) return "OVER_LIMIT";
  if (draft.platform === "instagram" && !draft.mediaAssetId) return "NEEDS_MEDIA";
  return "SAVED";
}

/** Drafts with no slot yet (never queued), newest first, with a status and tab counts. */
export const drafts = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("drafts").order("desc").take(PAGE);
    const cards = [];
    for (const draft of rows) {
      const slot = await ctx.db
        .query("slots")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .first();
      if (slot) continue;
      const topic = await ctx.db.get(draft.topicId);
      const linked = draft.carouselDraftId ? await ctx.db.get(draft.carouselDraftId) : null;
      cards.push({
        draftId: draft._id,
        topicId: draft.topicId,
        topicTitle: topic?.title ?? "(deleted topic)",
        platform: draft.platform,
        format: draft.format ?? null,
        slideCount: draft.slides?.length ?? linked?.slides?.length ?? null,
        body: firstPost(draft.body),
        charCount: draft.charCount,
        status: draftStatus(draft),
        createdAt: draft.createdAt,
      });
    }
    const counts = {
      all: cards.length,
      needsFixing: cards.filter((c) => c.status === "OVER_LIMIT" || c.status === "NEEDS_MEDIA").length,
      saved: cards.filter((c) => c.status === "SAVED").length,
      blog: cards.filter((c) => c.status === "BLOG").length,
    };
    return { cards, counts };
  },
});
