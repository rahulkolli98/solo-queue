import { action, mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

const FORMATS = {
  threads: { templateKey: "threads-hook-story", platform: "threads" },
  "instagram-caption": { templateKey: "ig-caption-beats", platform: "instagram" },
  "instagram-reel": { templateKey: "reel-script", platform: "instagram" },
  blog: { templateKey: "blog-draft", platform: "blog" },
} as const;

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

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/**
 * Store one generated draft, replacing any prior draft for the same
 * topic+template (regeneration replaces, never duplicates).
 */
export const storeDraft = mutation({
  args: {
    topicId: v.id("topics"),
    platform: v.union(v.literal("threads"), v.literal("instagram"), v.literal("blog")),
    templateKey: v.string(),
    templateVersion: v.number(),
    body: v.string(),
    charCount: v.number(),
    constraintOk: v.boolean(),
  },
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.db
      .query("drafts")
      .withIndex("by_topic_platform", (q) =>
        q.eq("topicId", args.topicId).eq("platform", args.platform)
      )
      .collect();
    for (const row of existing) {
      if (row.templateKey === args.templateKey) await ctx.db.delete(row._id);
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
      charCount: check.charCount,
      constraintOk: check.constraintOk,
      createdAt: Date.now(),
    });
    return id as string;
  },
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Missing env: ${name}. Set it where the backend runs (.env.local for local dev, Convex dashboard for prod).`
    );
  return value;
}

/**
 * Generate platform drafts for a topic from versioned templates.
 * One LLM call per format (default: threads + IG caption + IG reel + blog).
 * Each draft records the template key+version used, a char count, and
 * whether it satisfies its platform constraint. Re-running replaces prior
 * drafts for the same topic+template (regeneration, not duplication).
 * Marks the topic ready on success.
 */
export const generate = action({
  args: {
    topicId: v.id("topics"),
    formats: v.optional(v.array(formatArg)),
  },
  handler: async (ctx, args) => {
    const apiKey = requireEnv("LLM_API_KEY");
    const modelId = requireEnv("LLM_MODEL");
    const formats = (args.formats?.length ? args.formats : DEFAULT_FORMATS) as Format[];

    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new Error("Topic not found.");
    const actives = await ctx.runQuery(api.templates.list, {});
    const byKey = new Map(actives.map((t) => [t.key, t]));
    for (const f of formats) {
      if (!byKey.has(FORMATS[f].templateKey))
        throw new Error(`No active template for ${FORMATS[f].templateKey}. Seed or save one first.`);
    }

    const headers: Record<string, string> = {};
    if (process.env.APP_BASE_URL) {
      headers["HTTP-Referer"] = process.env.APP_BASE_URL;
      headers["X-Title"] = "Solo Queue";
    }
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: process.env.LLM_BASE_URL ?? OPENROUTER_URL,
      apiKey,
      headers,
    });
    const model = provider(modelId);
    const vars = buildTopicVars({
      title: topic.title,
      pillar: topic.pillar,
      notes: topic.notes,
      sourceUrl: topic.sourceUrl,
    });
    const system =
      "You are Solo Queue's drafting engine. Follow the template exactly. Output only the draft — no commentary, no preamble.";

    const results: {
      id: string;
      format: Format;
      templateKey: string;
      templateVersion: number;
      constraintOk: boolean;
      charCount: number;
    }[] = [];

    for (const format of formats) {
      const { templateKey, platform } = FORMATS[format];
      const template = byKey.get(templateKey)!;
      const prompt = fillSlots(template.body, vars);

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
          body = object.posts
            .map((p) => `${p.beat.toUpperCase()} · ${p.text.length} / 500\n${p.text}`)
            .join("\n---\n");
        } catch {
          console.warn(
            `drafting: structured output failed for ${modelId}, falling back to text.`
          );
          const { text } = await generateText({ model, system, prompt });
          body = text.trim();
        }
        const check = threadsConstraint(body);
        const id: string = await ctx.runMutation(api.drafting.storeDraft, {
          topicId: args.topicId,
          platform,
          templateKey,
          templateVersion: template.version,
          body,
          charCount: check.charCount,
          constraintOk: check.constraintOk,
        });
        results.push({ id, format, templateKey, templateVersion: template.version, ...check });
      } else {
        const { text } = await generateText({ model, system, prompt });
        body = text.trim();
        const check =
          format === "instagram-caption" ? captionConstraint(body) : plainConstraint(body);
        const id: string = await ctx.runMutation(api.drafting.storeDraft, {
          topicId: args.topicId,
          platform,
          templateKey,
          templateVersion: template.version,
          body,
          charCount: check.charCount,
          constraintOk: check.constraintOk,
        });
        results.push({ id, format, templateKey, templateVersion: template.version, ...check });
      }
    }

    await ctx.runMutation(api.topics.update, {
      id: args.topicId,
      status: "ready",
    });
    return { topicId: args.topicId, drafts: results };
  },
});
