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
import { carouselInstructions, clampSlideCount, parseCarousel } from "./lib/carouselDraft";
import { slideValidator } from "./lib/carouselValidators";
import { frameFitsKind, KIND_LABEL, resolveCount, resolveFrameKey, type SetupKind } from "./lib/formatSetup";
import { frameToPrompt, type FrameFit } from "./lib/framesModel";
import { llmModel, withLlmErrors } from "./lib/llm";
import { refusal } from "./lib/slots";
import { applySignOff, limitHashtags, voiceContextBlocks } from "./lib/voiceRules";

const FORMATS = {
  threads: { templateKey: "threads-hook-story", platform: "threads", draftFormat: "thread", fit: "thread" },
  "instagram-caption": { templateKey: "ig-caption-beats", platform: "instagram", draftFormat: "caption", fit: "single" },
  "instagram-reel": { templateKey: "reel-script", platform: "instagram", draftFormat: "reel", fit: "reel" },
  "instagram-carousel": { templateKey: "carousel-slides", platform: "instagram", draftFormat: "carousel", fit: "carousel" },
  blog: { templateKey: "blog-draft", platform: "blog", draftFormat: "blog", fit: null },
} as const satisfies Record<
  string,
  { templateKey: string; platform: string; draftFormat: string; fit: FrameFit | null }
>;

type Format = keyof typeof FORMATS;

/** The setup name of each generated format (what Settings and Studio call it). */
const SETUP_KIND: Record<Format, SetupKind> = {
  threads: "threads",
  "instagram-caption": "caption",
  "instagram-reel": "reel",
  "instagram-carousel": "carousel",
  blog: "blog",
};

const formatSetupArg = v.object({ frameKey: v.optional(v.string()), count: v.optional(v.number()) });

const formatArg = v.union(
  v.literal("threads"),
  v.literal("instagram-caption"),
  v.literal("instagram-reel"),
  v.literal("instagram-carousel"),
  v.literal("blog")
);

const DEFAULT_FORMATS: Format[] = [
  "threads",
  "instagram-caption",
  "instagram-reel",
  "blog",
];

const SYSTEM_INTRO =
  "You are Solo Queue's drafting engine. Follow the template exactly. Output only the draft — no commentary, no preamble. ";

/** Posts and threads stay strictly inside the material: a made-up number is worse than no number. */
const STRICT_FACTS =
  "Use only facts, numbers, prices, dates, names and quotes that appear in the topic, notes or sources. " +
  "Never invent them. Prefer writing without a number at all. Only when one specific fact is essential and you were not given it, write a placeholder in double square brackets, such as [[your number]], for the founder to fill in, and use at most two placeholders in the whole thread. ";

const NO_INVENTED_EXPERIENCE =
  "Never invent what the founder did, tried, felt, said or noticed: write in the first person only about things the notes say happened to them. " +
  "When the topic is about something in the world rather than the founder's own build, explain it plainly in the founder's tone, with no made-up anecdote, no \"I always\" or \"my router\" moments. ";

const SYSTEM_OUTRO = "Do not write beat labels or character counts (such as HOOK · 117 / 500) into the posts.";

const BASE_SYSTEM = SYSTEM_INTRO + STRICT_FACTS + NO_INVENTED_EXPERIENCE + SYSTEM_OUTRO;

/** A carousel explains a subject, so it may add well-established context; its fact rule comes with the slide instructions. */
const CAROUSEL_SYSTEM = SYSTEM_INTRO + NO_INVENTED_EXPERIENCE + SYSTEM_OUTRO;

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
    /** A carousel's slides; `body` is then its caption. */
    slides: v.optional(v.array(slideValidator)),
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
      // A regenerated carousel has new slides, so its old rendered images are not carried over.
      mediaAssetId: args.platform === "instagram" && !args.slides ? carriedMedia : undefined,
      slides: args.slides,
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
    /** One frame for every format it fits (older callers). `setup` is the per-format way. */
    frameKey: v.optional(v.string()),
    /** How many posts the thread should have (2 to 12). Default: what the story frame has. */
    postCount: v.optional(v.number()),
    /** This run's choices per format: the story frame and, for threads, the post count. A frame that does not fit its format is refused. */
    setup: v.optional(
      v.object({
        threads: v.optional(formatSetupArg),
        caption: v.optional(formatSetupArg),
        reel: v.optional(formatSetupArg),
        carousel: v.optional(formatSetupArg),
      })
    ),
  },
  handler: async (ctx, args) => {
    const slides = args.setup?.carousel?.count;
    if (slides !== undefined && (!Number.isInteger(slides) || slides < 1 || slides > 10)) {
      throw refusal("BAD_SLIDE_COUNT", "A carousel can have 1 to 10 slides when it is written for you.");
    }
    for (const count of [args.postCount, args.setup?.threads?.count]) {
      if (count !== undefined && (!Number.isInteger(count) || count < 2 || count > 12)) {
        throw refusal("BAD_POST_COUNT", "A thread can have 2 to 12 posts when it is written for you.");
      }
    }
    if (args.formats && args.formats.length === 0) {
      throw refusal("NO_FORMATS", "Choose at least one thing to write.");
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
    const postCount =
      args.setup?.threads?.count ??
      args.postCount ??
      resolveCount({
        kind: "threads",
        defaults: settings.voice.formatDefaults,
        legacyPostCount: settings.voice.defaultPostCount,
      });

    const slideCount = clampSlideCount(
      args.setup?.carousel?.count ?? resolveCount({ kind: "carousel", defaults: settings.voice.formatDefaults })
    );

    // One story frame per format: this run's pick, else the saved default for the format. A pick that does not
    // suit its format is refused here, before any model call is paid for.
    const frames = await ctx.runQuery(api.frames.list, {});
    const frameFor = new Map<Format, (typeof frames)[number]>();
    for (const format of formats) {
      const kind = SETUP_KIND[format];
      const picked = kind === "threads" || kind === "caption" || kind === "reel" || kind === "carousel" ? args.setup?.[kind]?.frameKey : undefined;
      let key: string | undefined;
      if (picked) {
        const frame = frames.find((f) => f.key === picked);
        if (!frame) throw refusal("FRAME_NOT_FOUND", "That story frame is not available. Pick another.");
        if (!frameFitsKind(frame, kind)) {
          throw refusal("FRAME_DOESNT_FIT", `"${frame.name}" is not a ${KIND_LABEL[kind]} frame. Pick another.`);
        }
        key = picked;
      } else if (args.frameKey) {
        // Older callers: one frame for every format it fits, the rest are written without one.
        const frame = frames.find((f) => f.key === args.frameKey);
        key = frame && frameFitsKind(frame, kind) ? frame.key : undefined;
      } else {
        key = resolveFrameKey({
          kind,
          defaults: settings.voice.formatDefaults,
          legacyDefaultKey: settings.voice.defaultFrameKey,
          frames,
        });
      }
      const frame = key ? frames.find((f) => f.key === key) : undefined;
      if (frame) frameFor.set(format, frame);
    }

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
    const systemWith = (head: string) =>
      [
        head,
        settings.voice.description ? `Voice: ${settings.voice.description}` : "",
        ...voiceContextBlocks(settings.voice),
        settings.voice.bannedWords.length
          ? `Never use these words or phrases: ${settings.voice.bannedWords.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    const system = systemWith(BASE_SYSTEM);
    const carouselSystem = systemWith(CAROUSEL_SYSTEM);

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
      const { templateKey, platform, draftFormat } = FORMATS[format];
      const template = byKey.get(templateKey)!;
      // The frame steers every format except the blog draft; it was chosen above to fit this format.
      const frame = frameFor.get(format);
      const useFrame = frame !== undefined;
      const basePrompt = fillSlots(template.body, vars);
      const withFrame = useFrame ? `${basePrompt}\n\n${frameToPrompt(frame)}` : basePrompt;
      const withCount =
        format === "threads" && postCount
          ? `${withFrame}\n\nWrite exactly ${postCount} posts, separated by --- lines. Ignore any other number of posts mentioned above, and spread the story across all ${postCount} posts.`
          : withFrame;
      const withHashtags =
        platform === "instagram" ? `${withCount}\n\n${hashtagInstruction(settings.voice.igHashtagMax)}` : withCount;
      // A carousel is written as JSON (caption and slides); the frame's beats are its story arc and its style note guides the look.
      const prompt =
        format === "instagram-carousel"
          ? `${withHashtags}\n\nThe beats above are the arc of the story: spread them across the slides.\n\n${carouselInstructions({ count: slideCount, style: frame?.style })}`
          : withHashtags;

      if (format === "instagram-carousel") {
        const reply = await withLlmErrors(async () => (await generateText({ model, system: carouselSystem, prompt })).text);
        const written = parseCarousel(reply, slideCount);
        if (!written) {
          throw refusal("BAD_CAROUSEL", "The AI model did not send back a usable carousel. Try again.");
        }
        const caption = limitHashtags(written.caption, settings.voice.igHashtagMax);
        const check = captionConstraint(caption);
        const id: string = await ctx.runMutation(internal.drafting.storeDraft, {
          topicId: args.topicId,
          platform,
          templateKey,
          templateVersion: template.version,
          body: caption,
          charCount: check.charCount,
          constraintOk: check.constraintOk,
          frameKey: useFrame ? frame.key : undefined,
          format: draftFormat,
          slides: written.slides,
        });
        if (useFrame) await ctx.runMutation(internal.frames.recordUse, { key: frame.key });
        results.push({ id, format, templateKey, templateVersion: template.version, ...check });
        return;
      }

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
