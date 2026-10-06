import { api, internal } from "./_generated/api";
import { operatorAction } from "./lib/operator";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { generateObject, generateText } from "ai";
import { llmModel, withLlmErrors } from "./lib/llm";
import {
  anglesSchema,
  buildAnglesPrompt,
  buildBriefPrompt,
  parseAnglesText,
  usableAngles,
  type Angle,
} from "./lib/research";

const SYSTEM =
  "You are Solo Queue's research assistant for one founder. Be concrete and slightly dry. Never invent facts, numbers or quotes.";

/**
 * Write the topic's ~140-word brief from its notes and sources. Refuses to
 * overwrite a brief the founder edited unless `force` is set.
 */
export const brief = operatorAction({
  args: { topicId: v.id("topics"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ brief: string }> => {
    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new ConvexError("VALIDATION:TOPIC_NOT_FOUND: Topic not found — it may have been deleted.");
    if (topic.briefEditedAt && !args.force) {
      throw new ConvexError(
        "VALIDATION:BRIEF_EDITED: You edited this brief. Regenerating will replace your edits."
      );
    }
    const sources = await ctx.runQuery(api.sources.listByTopic, { topicId: args.topicId });
    const { text } = await withLlmErrors(() =>
      generateText({
        model: llmModel(),
        system: SYSTEM,
        prompt: buildBriefPrompt({
          title: topic.title,
          notes: topic.notes,
          sources: sources.map((s) => ({ kind: s.kind, label: s.label, url: s.url, text: s.text })),
        }),
      })
    );
    const brief = text.trim();
    if (!brief) throw new ConvexError("VALIDATION:EMPTY_BRIEF: The model returned nothing. Try again.");
    await ctx.runMutation(internal.topics.setBrief, { id: args.topicId, brief });
    return { brief };
  },
});

/** Suggest three post angles (platform, format, story frame) for a topic. */
export const angles = operatorAction({
  args: { topicId: v.id("topics") },
  handler: async (ctx, args): Promise<{ angles: { platform: string; format: string; frameKey: string; title: string }[] }> => {
    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new ConvexError("VALIDATION:TOPIC_NOT_FOUND: Topic not found — it may have been deleted.");
    const frames = await ctx.runQuery(api.frames.list, {});
    if (frames.length === 0) {
      throw new ConvexError("VALIDATION:NO_FRAMES: Add a story frame in the Library first.");
    }
    const prompt = buildAnglesPrompt({
      title: topic.title,
      brief: topic.brief,
      frames: frames.map((f) => ({ key: f.key, name: f.name, fits: f.fits })),
    });
    const angles: Angle[] = await withLlmErrors(async () => {
      const model = llmModel();
      try {
        return (await generateObject({ model, system: SYSTEM, schema: anglesSchema, prompt })).object.angles;
      } catch {
        // Some models (common on free tiers) reject structured output: ask for plain JSON instead.
        console.warn("research.angles: structured output failed, falling back to text.");
        const { text } = await generateText({
          model,
          system: SYSTEM,
          prompt: `${prompt}

Reply with only a JSON object: {"angles":[{"platform":"threads","format":"thread","frameKey":"<key>","title":"<title>"}, ...]}`,
        });
        return parseAnglesText(text);
      }
    });
    const usable = usableAngles(angles, frames);
    if (usable.length === 0) {
      throw new ConvexError("VALIDATION:NO_ANGLES: The model suggested nothing usable. Try again.");
    }
    await ctx.runMutation(internal.topics.setAngles, { id: args.topicId, angles: usable });
    return { angles: usable };
  },
});
