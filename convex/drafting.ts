import { internalMutation } from "./_generated/server";
import { operatorAction } from "./lib/operator";
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
  splitPosts,
  stripBeatHeaders,
  threadsConstraint,
} from "./lib/drafting";
import { frameToPrompt, type FrameFit } from "./lib/framesModel";
import { llmModel, withLlmErrors } from "./lib/llm";
import { refusal } from "./lib/slots";
import { applySignOff, limitHashtags } from "./lib/voiceRules";

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
  "You are Solo Queue's drafting engine. Follow the template exactly. Output only the draft — no commentary, no preamble. " +
  "Use only facts, numbers, prices, dates, names and quotes that appear in the topic, notes or sources. " +
  "Never invent them. Prefer writing without a number at all. Only when one specific fact is essential and you were not given it, write a placeholder in double square brackets, such as [[your number]], for the founder to fill in, and use at most two placeholders in the whole thread. " +
  "Do not write beat labels or character counts (such as HOOK · 117 / 500) into the posts.";

/** The prompt line that tells the model the founder's hashtag cap, so it does not spend them. */
function hashtagInstruction(max: number): string {
  // The template asks for a hashtag count of its own; this line comes last so it wins.
  if (max <= 0) return "Do not use any hashtags (this overrides any hashtag count above).";
  return `Use at most ${max} ${max === 1 ? "hashtag" : "hashtags"} (this overrides any hashtag count above).`;
}

/** A reel draft is the timed script, a `---` line, then the one-line caption: only the caption carries hashtags. */
function limitReelHashtags(body: string, max: number): string {
  const parts = body.split(/^[ \t]*---[ \t]*$/m);
  if (parts.length < 2) return body;
  return [parts[0].trimEnd(), limitHashtags(parts.slice(1).join("\n---\n"), max)].join("\n---\n");
}

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
    // A file the post-publish cleanup removed is not carried over to the new draft.
    if (carriedMedia) {
      const carried = await ctx.db.get(carriedMedia);
      if (!carried || carried.fileDeletedAt !== undefined) carriedMedia = undefined;
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
export const generate = operatorAction({
  args: {
    topicId: v.id("topics"),
    formats: v.optional(v.array(formatArg)),
    frameKey: v.optional(v.string()),
    /** How many posts the thread should have (2 to 12). Default: what the story frame has. */
    postCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.postCount !== undefined && (!Number.isInteger(args.postCount) || args.postCount < 2 || args.postCount > 12)) {
      throw refusal("BAD_POST_COUNT", "A thread can have 2 to 12 posts when it is written for you.");
    }
    const formats = (args.formats?.length ? args.formats : DEFAULT_FORMATS) as Format[];

    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new Error("Topic not found — it may have been deleted.");
    await ctx.runMutation(internal.templates.ensureDefaults, {});
    const actives = await ctx.runQuery(api.templates.list, {});
    const byKey = new Map(actives.map((t) => [t.key, t]));
    for (const f of formats) {
      if (!byKey.has(FORMATS[f].templateKey))
        throw refusal("NO_TEMPLATE", `No active template for ${FORMATS[f].templateKey}. Save one in the Library first.`);
    }

    const settings = await ctx.runQuery(api.settings.get, {});
    // A number chosen for this run wins; otherwise the saved default; otherwise the story frame decides.
    const savedCount = settings.voice.defaultPostCount;
    const postCount = args.postCount ?? (savedCount !== undefined && savedCount >= 2 ? savedCount : undefined);
    const frameKey = args.frameKey ?? settings.voice.defaultFrameKey;
    const frame = await ctx.runQuery(api.frames.getByKey, { key: frameKey });

    const model = await withLlmErrors(async () => llmModel());
    // The research brief and the topic's sources are the model's main material when they exist.
    const sources = await ctx.runQuery(api.sources.listByTopic, { topicId: args.topicId });
    const vars = buildTopicVars({
      title: topic.title,
      pillar: topic.pillar,
      notes: topic.notes,
      sourceUrl: topic.sourceUrl,
      brief: topic.brief,
      sources: sources.map((x) => ({ kind: x.kind, label: x.label, url: x.url, text: x.text })),
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

    // The formats do not depend on each other, so the model calls run side by side: the founder waits for the
    // slowest one, not for the sum of all four. Each draft is stored as soon as its own call finishes.
    const writeFormat = async (format: Format): Promise<void> => {
      const { templateKey, platform, draftFormat, fit } = FORMATS[format];
      const template = byKey.get(templateKey)!;
      // The frame steers every format except the blog draft, and only where it fits.
      const useFrame = frame && frame.isActive && fit !== null && frame.fits.includes(fit);
      const basePrompt = fillSlots(template.body, vars);
      const withFrame = useFrame ? `${basePrompt}\n\n${frameToPrompt(frame)}` : basePrompt;
      const withCount =
        format === "threads" && postCount
          ? `${withFrame}\n\nWrite exactly ${postCount} posts, separated by --- lines. Ignore any other number of posts mentioned above, and spread the story across all ${postCount} posts.`
          : withFrame;
      const prompt =
        platform === "instagram" ? `${withCount}\n\n${hashtagInstruction(settings.voice.igHashtagMax)}` : withCount;

      const modelBody: string = await withLlmErrors(async () => {
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
                .max(12),
            }),
          });
          body = object.posts.map((p) => p.text.trim()).join("\n---\n");
        } catch {
          console.warn("drafting: structured output failed, falling back to text.");
          const { text } = await generateText({ model, system, prompt });
          body = stripBeatHeaders(text.trim());
        }
      } else {
        const { text } = await generateText({ model, system, prompt });
        body = text.trim();
      }
      return body;
      });

      // The founder's sign-off and hashtag cap are applied to what the model wrote,
      // so they hold even when the model ignores the prompt.
      const body =
        format === "threads"
          ? applySignOff(splitPosts(modelBody), settings.voice.signOff).join("\n---\n")
          : format === "instagram-caption"
            ? limitHashtags(modelBody, settings.voice.igHashtagMax)
            : format === "instagram-reel"
              ? limitReelHashtags(modelBody, settings.voice.igHashtagMax)
              : modelBody;

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
    };

    const settled = await Promise.allSettled(formats.map(writeFormat));
    results.sort((a, b) => formats.indexOf(a.format) - formats.indexOf(b.format));
    // Drafts that landed stay saved; the first failure (in format order) is reported, as before.
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;

    await ctx.runMutation(api.topics.update, {
      id: args.topicId,
      status: "ready",
    });
    return { topicId: args.topicId, drafts: results };
  },
});
