import { v } from "convex/values";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { slideValidator } from "./lib/carouselValidators";
import { MAX_SLIDES, MIN_SLIDES, validateSlide } from "./lib/carouselSlides";
import { checkEditedBody } from "./lib/drafting";
import { assertOwnImages, placeholderSlides } from "./lib/ownCarousel";
import { DEFAULT_THEME, isThemeKey } from "./lib/themes";
import { assertFileNotRemoved, refusal } from "./lib/slots";

/**
 * Drafts for one topic, oldest first. Powers the composer tabs (Phase 2)
 * and verifies regeneration replaces instead of duplicating.
 */
export const listByTopic = operatorQuery({
  args: { topicId: v.id("topics") },
  handler: async (ctx, args) => {
    const [threads, instagram, blog] = await Promise.all(
      (["threads", "instagram", "blog"] as const).map((platform) =>
        ctx.db
          .query("drafts")
          .withIndex("by_topic_platform", (q) =>
            q.eq("topicId", args.topicId).eq("platform", platform)
          )
          .collect()
      )
    );
    return [...threads, ...instagram, ...blog].sort(
      (a, b) => a.createdAt - b.createdAt
    );
  },
});

/**
 * Persist an inline edit from the composer. Recomputes charCount/constraintOk
 * server-side with the same mapping as generation, so stored badges never
 * drift from what the queue validator will check.
 */export const update = operatorMutation({
  args: { id: v.id("drafts"), body: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    // Normalize line endings: the textarea reads back LF, so storing CRLF
    // would make display, counts, and exports disagree by a char per line.
    const body = args.body.replace(/\r\n?/g, "\n");
    if (!body.trim()) throw refusal("EMPTY_DRAFT", "A draft can't be empty.");
    if (body.length > 20000)
      throw refusal("TOO_LONG", "Draft is too long (20,000 character max).");
    const check = checkEditedBody(draft.platform, draft.templateKey, body);
    await ctx.db.patch(args.id, {
      body,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
    });
    return null;
  },
});

/** What a hand-written draft of each kind is stored as (matches the generated drafts). */
const MANUAL_KINDS = {
  threads: { platform: "threads", templateKey: "threads-hook-story", format: "thread" },
  caption: { platform: "instagram", templateKey: "ig-caption-beats", format: "caption" },
  reel: { platform: "instagram", templateKey: "reel-script", format: "reel" },
  blog: { platform: "blog", templateKey: "blog-draft", format: "blog" },
} as const;

/**
 * "Write it myself": store text the founder wrote as a draft of the topic, so
 * it gets the same counters, media, editing and queueing as a generated one.
 * If an unqueued draft of the same kind exists it is replaced in place; a draft
 * that already has a post is left alone and a new one is added beside it.
 */
export const createManual = operatorMutation({
  args: {
    topicId: v.id("topics"),
    kind: v.union(v.literal("threads"), v.literal("caption"), v.literal("reel"), v.literal("blog")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) throw refusal("TOPIC_NOT_FOUND", "Topic not found. It may have been deleted.");
    const body = args.body.replace(/\r\n?/g, "\n");
    if (!body.trim()) throw refusal("EMPTY_DRAFT", "A draft can't be empty.");
    if (body.length > 20000) throw refusal("TOO_LONG", "Draft is too long (20,000 character max).");

    const { platform, templateKey, format } = MANUAL_KINDS[args.kind];
    const check = checkEditedBody(platform, templateKey, body);
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) => q.eq("topicId", args.topicId).eq("platform", platform))
      .take(200);
    for (const row of existing.filter((d) => d.templateKey === templateKey)) {
      const slot = await ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", row._id)).first();
      if (slot) continue;
      await ctx.db.patch(row._id, { body, charCount: check.charCount, constraintOk: check.constraintOk });
      return row._id;
    }
    const template = await ctx.db
      .query("templates")
      .withIndex("by_key", (q) => q.eq("key", templateKey))
      .collect();
    const id = await ctx.db.insert("drafts", {
      topicId: args.topicId,
      platform,
      body,
      templateKey,
      templateVersion: template.find((t) => t.isActive)?.version ?? 1,
      format,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
      createdAt: Date.now(),
    });
    if (topic.status === "drafting") await ctx.db.patch(args.topicId, { status: "ready" });
    return id;
  },
});

/**
 * Attach (or detach, with null) a library asset to a draft. IG drafts need
 * this before they can queue; the asset itself must exist. Verification
 * freshness is checked at enqueue time, not here.
 */
export const attachMedia = operatorMutation({
  args: { id: v.id("drafts"), mediaAssetId: v.union(v.id("mediaAssets"), v.null()) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw new Error("Draft not found — it may have been deleted.");
    if (args.mediaAssetId !== null) {
      const asset = await ctx.db.get(args.mediaAssetId);
      if (!asset) throw new Error("Media not found — it may have been deleted.");
      assertFileNotRemoved(asset);
    }
    await ctx.db.patch(args.id, { mediaAssetId: args.mediaAssetId ?? undefined });
    return null;
  },
});

/** A carousel that already has a post (queued, published or failed) must be changed in the Queue first. */
async function assertNotQueued(ctx: { db: import("./_generated/server").QueryCtx["db"] }, draftId: import("./_generated/dataModel").Id<"drafts">) {
  const slot = await ctx.db
    .query("slots")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .first();
  if (slot) {
    throw refusal("CAROUSEL_QUEUED", "This carousel already has a post in the Queue. Cancel that post first, then change the slides.");
  }
}

/**
 * Save the founder's edits to a carousel's slides (2 to 10, each within the slide limits). The rendered images no
 * longer match once a slide changes, so they are detached: render the slides again, then attach.
 */
export const updateSlides = operatorMutation({
  args: { id: v.id("drafts"), slides: v.array(slideValidator) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    if (!draft.slides) throw refusal("NOT_A_CAROUSEL", "Only a carousel has slides.");
    if (draft.slideSource === "uploaded") throw refusal("OWN_IMAGES", "This carousel is made of your own images, so it has no slides to edit.");
    if (args.slides.length < MIN_SLIDES || args.slides.length > MAX_SLIDES) {
      throw refusal("BAD_SLIDE_COUNT", `A carousel has ${MIN_SLIDES} to ${MAX_SLIDES} slides. This one has ${args.slides.length}.`);
    }
    const slides = [];
    for (let i = 0; i < args.slides.length; i += 1) {
      const checked = validateSlide(args.slides[i]);
      if (!checked.ok) throw refusal("INVALID_SLIDE", `Slide ${i + 1}: ${checked.message}`);
      slides.push(JSON.parse(JSON.stringify(checked.slide)));
    }
    await assertNotQueued(ctx, args.id);
    await ctx.db.patch(args.id, { slides, mediaAssetIds: undefined, mediaAssetId: undefined });
    return null;
  },
});

/**
 * Attach the rendered slide images to a carousel: one image per slide, in order, each a stored PNG or JPEG. The
 * first becomes the cover (`mediaAssetId`). An empty list detaches them. Reachability is checked when the
 * carousel is queued, not here.
 */
export const attachCarouselMedia = operatorMutation({
  args: { id: v.id("drafts"), mediaAssetIds: v.array(v.id("mediaAssets")) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    if (!draft.slides) throw refusal("NOT_A_CAROUSEL", "Only a carousel takes slide images.");
    if (draft.slideSource === "uploaded") throw refusal("OWN_IMAGES", "This carousel is made of your own images. Change them from the image list.");
    await assertNotQueued(ctx, args.id);
    if (args.mediaAssetIds.length === 0) {
      await ctx.db.patch(args.id, { mediaAssetIds: undefined, mediaAssetId: undefined });
      return null;
    }
    if (args.mediaAssetIds.length !== draft.slides.length) {
      throw refusal(
        "SLIDE_IMAGE_COUNT",
        `This carousel has ${draft.slides.length} slides, so it needs ${draft.slides.length} images. You sent ${args.mediaAssetIds.length}.`
      );
    }
    if (new Set(args.mediaAssetIds).size !== args.mediaAssetIds.length) {
      throw refusal("SLIDE_IMAGE_DUPLICATE", "Each slide needs its own image.");
    }
    for (const id of args.mediaAssetIds) {
      const asset = await ctx.db.get(id);
      if (!asset) throw refusal("MEDIA_MISSING", "A slide image is gone. Render the slides again.");
      assertFileNotRemoved(asset);
      if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") {
        throw refusal("SLIDE_IMAGE_TYPE", "Slide images must be PNG or JPEG files.");
      }
    }
    await ctx.db.patch(args.id, { mediaAssetIds: args.mediaAssetIds, mediaAssetId: args.mediaAssetIds[0] });
    return null;
  },
});

/**
 * "Use my own images": a carousel from the founder's own PNG or JPEG files (2 to 10, in order) and a caption.
 * It is stored like a written carousel (one placeholder slide per image, `slideSource: "uploaded"`) so counts, the
 * Queue and Instagram treat it the same. An unqueued carousel of the topic is replaced; one that already has a post
 * is left alone and this one is added beside it. The files stay in the library either way.
 */
export const createOwnCarousel = operatorMutation({
  args: { topicId: v.id("topics"), caption: v.string(), mediaAssetIds: v.array(v.id("mediaAssets")) },
  handler: async (ctx, args) => {
    const topic = await ctx.db.get(args.topicId);
    if (!topic) throw refusal("TOPIC_NOT_FOUND", "Topic not found. It may have been deleted.");
    const body = args.caption.replace(/\r\n?/g, "\n");
    if (!body.trim()) throw refusal("EMPTY_DRAFT", "Write the caption first. A carousel needs one.");
    if (body.length > 20000) throw refusal("TOO_LONG", "Draft is too long (20,000 character max).");
    await assertOwnImages(ctx, args.mediaAssetIds);

    const templateKey = "carousel-slides";
    const check = checkEditedBody("instagram", templateKey, body);
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) => q.eq("topicId", args.topicId).eq("platform", "instagram"))
      .take(200);
    for (const row of existing.filter((d) => d.templateKey === templateKey)) {
      const slot = await ctx.db.query("slots").withIndex("by_draft", (q) => q.eq("draftId", row._id)).first();
      if (!slot) await ctx.db.delete(row._id);
    }
    const template = await ctx.db.query("templates").withIndex("by_key", (q) => q.eq("key", templateKey)).collect();
    const id = await ctx.db.insert("drafts", {
      topicId: args.topicId,
      platform: "instagram",
      body,
      templateKey,
      templateVersion: template.find((t) => t.isActive)?.version ?? 1,
      format: "carousel",
      slides: placeholderSlides(args.mediaAssetIds.length),
      slideSource: "uploaded",
      mediaAssetIds: args.mediaAssetIds,
      mediaAssetId: args.mediaAssetIds[0],
      charCount: check.charCount,
      constraintOk: check.constraintOk,
      createdAt: Date.now(),
    });
    if (topic.status === "drafting") await ctx.db.patch(args.topicId, { status: "ready" });
    return id;
  },
});

/** Change the images of an own carousel: add, remove or reorder (2 to 10). The files themselves stay in the library. */
export const setOwnCarouselImages = operatorMutation({
  args: { id: v.id("drafts"), mediaAssetIds: v.array(v.id("mediaAssets")) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    if (draft.slideSource !== "uploaded") {
      throw refusal("NOT_OWN_CAROUSEL", "Only a carousel made of your own images can be changed this way.");
    }
    await assertNotQueued(ctx, args.id);
    await assertOwnImages(ctx, args.mediaAssetIds);
    await ctx.db.patch(args.id, {
      slides: placeholderSlides(args.mediaAssetIds.length),
      mediaAssetIds: args.mediaAssetIds,
      mediaAssetId: args.mediaAssetIds[0],
    });
    return null;
  },
});

/**
 * Change the design a written carousel is drawn in. The drawn images no longer match, so they are detached (draw the
 * slides again), as when a slide is edited. Leave `theme` out (or pass the default) for Solo Queue. A carousel made of
 * the founder's own images has no design to change, and one that already has a post must be changed in the Queue first.
 */
export const setTheme = operatorMutation({
  args: { id: v.id("drafts"), theme: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) throw refusal("DRAFT_NOT_FOUND", "Draft not found — it may have been replaced.");
    if (!draft.slides) throw refusal("NOT_A_CAROUSEL", "Only a carousel has a design.");
    if (draft.slideSource === "uploaded") throw refusal("OWN_IMAGES", "This carousel is made of your own images, so it has no design to change.");
    if (args.theme && !isThemeKey(args.theme)) throw refusal("THEME_NOT_FOUND", "That theme is not available. Pick another.");
    await assertNotQueued(ctx, args.id);
    const next = args.theme && args.theme !== DEFAULT_THEME ? args.theme : undefined;
    if (draft.theme === next) return null;
    await ctx.db.patch(args.id, { theme: next, mediaAssetIds: undefined, mediaAssetId: undefined });
    return null;
  },
});

/**
 * Delete one draft that was never queued. A draft with a post in the Queue, or one already published or failed,
 * must not vanish (the Queue and Published list read it), so it is refused: cancel the post first. The topic goes
 * back to "drafting" when this was its last draft. The attached media files stay in the library (usage is counted
 * live). Deleting a draft that is already gone does nothing.
 */
export const remove = operatorMutation({
  args: { id: v.id("drafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.id);
    if (!draft) return null;
    const slot = await ctx.db
      .query("slots")
      .withIndex("by_draft", (q) => q.eq("draftId", args.id))
      .first();
    if (slot) {
      throw refusal(
        "HAS_SLOT",
        "This draft has a post in the Queue or Published. Cancel or remove that post first, then delete the draft."
      );
    }
    await ctx.db.delete(args.id);
    const rest = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) => q.eq("topicId", draft.topicId))
      .first();
    if (!rest) {
      const topic = await ctx.db.get(draft.topicId);
      if (topic?.status === "ready") await ctx.db.patch(draft.topicId, { status: "drafting" });
    }
    return null;
  },
});
