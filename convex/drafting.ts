import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  buildTopicVars,
  captionConstraint,
  checkEditedBody,
  fillSlots,
  plainConstraint,
  threadsConstraint,
} from "./lib/drafting";
import { frameToPrompt, type FrameFit } from "./lib/framesModel";
import { llmModel } from "./lib/llm";

const FORMATS = {
  threads: { templateKey: "threads-hook-story", platform: "threads", draftFormat: "thread", fit: "thread" },
  "instagram-caption": { templateKey: "ig-caption-beats", platform: "instagram", draftFormat: "caption", fit: "single" },
  "instagram-reel": { templateKey: "reel-script", platform: "instagram", draftFormat: "reel", fit: "reel" },
  blog: { templateKey: "blog-draft", platform: "blog", draftFormat: "blog", fit: null },
} as const satisfies Record<
  string,
  { templateKey: string; platform: string; draftFormat: string; fit: FrameFit | null }
>;

type Format = keyof typeof FORMATS;

const formatArg = v.union(
  v.literal("threads"),
  v.literal("instagram-caption"),
  v.literal("instagram-reel"),
  v.literal("blog")
);

const DEFAULT_FORMATS: Format[] = [
  "threads",
  "instagram-caption",
  "instagram-reel",
  "blog",
];

const BASE_SYSTEM =
  "You are Solo Queue's drafting engine. Follow the template exactly. Output only the draft — no commentary, no preamble.";

/**
 * Store one generated draft. Regenerating replaces the previous draft for the
 * same topic and template, EXCEPT a draft that already has a slot: that one is
 * kept (a queued or published post must never disappear) and the new draft is
 * added beside it. Internal: only `generate` may call it.
 */
export const storeDraft = internalMutation({
  args: {
    topicId: v.id("topics"),
    platform: v.union(v.literal("threads"), v.literal("instagram"), v.literal("blog")),
    templateKey: v.string(),
    templateVersion: v.number(),
    body: v.string(),
    charCount: v.number(),
    constraintOk: v.boolean(),
    frameKey: v.optional(v.string()),
    format: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) =>
        q.eq("topicId", args.topicId).eq("platform", args.platform)
      )
      .take(200);
    // Regenerating replaces the unqueued draft; the media the founder attached
    // to it stays attached to its replacement.
    let carriedMedia: (typeof existing)[number]["mediaAssetId"];
    for (const row of existing) {
      if (row.templateKey !== args.templateKey) continue;
      const slot = await ctx.db
        .query("slots")
        .withIndex("by_draft", (q) => q.eq("draftId", row._id))
        .first();
      if (!slot) {
        carriedMedia = row.mediaAssetId ?? carriedMedia;
        await ctx.db.delete(row._id);
      }
    }
    // Normalize line endings (model output may carry CRLF) and recompute
    // counts on the stored text, so display/counts/exports always agree.
    const body = args.body.replace(/\r\n?/g, "\n");
    const check = checkEditedBody(args.platform, args.templateKey, body);
    const id = await ctx.db.insert("drafts", {
      topicId: args.topicId,
      platform: args.platform,
      body,
      templateKey: args.templateKey,
      templateVersion: args.templateVersion,
      frameKey: args.frameKey,
      format: args.format,
      mediaAssetId: args.platform === "instagram" ? carriedMedia : undefined,
      charCount: check.charCount,
      constraintOk: check.constraintOk,
      createdAt: Date.now(),
    });
    return id as string;
  },
});

/**
 * Generate platform drafts for a topic from versioned templates, following a
 * story frame (default: the voice's default frame) and the voice settings.
 * One LLM call per format (default: threads + IG caption + IG reel + blog).
 * Each draft records the template key+version, the frame and format, a char
 * count, and whether it satisfies its platform constraint. Thread posts are
 * stored as plain text separated by `---` lines (no beat headers: the beat
 * labels come from the frame at display time), so what is stored is what is
 * published. Marks the topic ready on success.
 */
export const generate = action({
  args: {
    topicId: v.id("topics"),
    formats: v.optional(v.array(formatArg)),
    frameKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const formats = (args.formats?.length ? args.formats : DEFAULT_FORMATS) as Format[];

    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new Error("Topic not found.");
    const actives = await ctx.runQuery(api.templates.list, {});
    const byKey = new Map(actives.map((t) => [t.key, t]));
    for (const f of formats) {
      if (!byKey.has(FORMATS[f].templateKey))
        throw new Error(`No active template for ${FORMATS[f].templateKey}. Seed or save one first.`);
    }

    const settings = await ctx.runQuery(api.settings.get, {});
    const frameKey = args.frameKey ?? settings.voice.defaultFrameKey;
    const frame = await ctx.runQuery(api.frames.getByKey, { key: frameKey });

    const model = llmModel();
    const vars = buildTopicVars({
      title: topic.title,
      pillar: topic.pillar,
      notes: topic.notes,
      sourceUrl: topic.sourceUrl,
    });
    const system = [
      BASE_SYSTEM,
      settings.voice.description ? `Voice: ${settings.voice.description}` : "",
      settings.voice.bannedWords.length
        ? `Never use these words or phrases: ${settings.voice.bannedWords.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const results: {
      id: string;
      format: Format;
      templateKey: string;
      templateVersion: number;
      constraintOk: boolean;
      charCount: number;
    }[] = [];

    for (const format of formats) {
      const { templateKey, platform, draftFormat, fit } = FORMATS[format];
      const template = byKey.get(templateKey)!;
      // The frame steers every format except the blog draft, and only where it fits.
      const useFrame = frame && frame.isActive && fit !== null && frame.fits.includes(fit);
      const basePrompt = fillSlots(template.body, vars);
      const prompt = useFrame ? `${basePrompt}\n\n${frameToPrompt(frame)}` : basePrompt;

      let body: string;
      if (format === "threads") {
        // Prefer structured output (exact beats); fall back to plain text
        // for models without JSON-mode support (common on free tiers) —
        // the template already asks for --- separators, so parsing holds.
        try {
          const { object } = await generateObject({
            model,
            system,
            prompt,
            schema: z.object({
              posts: z
                .array(z.object({ beat: z.string(), text: z.string() }))
                .min(1)
                .max(6),
            }),
          });
          body = object.posts.map((p) => p.text.trim()).join("\n---\n");
        } catch {
          console.warn("drafting: structured output failed, falling back to text.");
          const { text } = await generateText({ model, system, prompt });
          body = text.trim();
        }
      } else {
        const { text } = await generateText({ model, system, prompt });
        body = text.trim();
      }

      const check =
        format === "threads"
          ? threadsConstraint(body)
          : format === "instagram-caption"
            ? captionConstraint(body)
            : plainConstraint(body);
      const id: string = await ctx.runMutation(internal.drafting.storeDraft, {
        topicId: args.topicId,
        platform,
        templateKey,
        templateVersion: template.version,
        body,
        charCount: check.charCount,
        constraintOk: check.constraintOk,
        frameKey: useFrame ? frame.key : undefined,
        format: draftFormat,
      });
      if (useFrame) await ctx.runMutation(internal.frames.recordUse, { key: frame.key });
      results.push({ id, format, templateKey, templateVersion: template.version, ...check });
    }

    await ctx.runMutation(api.topics.update, {
      id: args.topicId,
      status: "ready",
    });
    return { topicId: args.topicId, drafts: results };
  },
});
