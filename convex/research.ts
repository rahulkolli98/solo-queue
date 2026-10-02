import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { generateObject, generateText } from "ai";
import { llmModel } from "./lib/llm";
import {
  anglesSchema,
  buildAnglesPrompt,
  buildBriefPrompt,
  usableAngles,
} from "./lib/research";

const SYSTEM =
  "You are Solo Queue's research assistant for one founder. Be concrete and slightly dry. Never invent facts, numbers or quotes.";

/**
 * Write the topic's ~140-word brief from its notes and sources. Refuses to
 * overwrite a brief the founder edited unless `force` is set.
 */
export const brief = action({
  args: { topicId: v.id("topics"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ brief: string }> => {
    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new ConvexError("VALIDATION:TOPIC_NOT_FOUND: Topic not found.");
    if (topic.briefEditedAt && !args.force) {
      throw new ConvexError(
        "VALIDATION:BRIEF_EDITED: You edited this brief. Regenerating will replace your edits."
      );
    }
    const sources = await ctx.runQuery(api.sources.listByTopic, { topicId: args.topicId });
    const { text } = await generateText({
      model: llmModel(),
      system: SYSTEM,
      prompt: buildBriefPrompt({
        title: topic.title,
        notes: topic.notes,
        sources: sources.map((s) => ({ kind: s.kind, label: s.label, url: s.url, text: s.text })),
      }),
    });
    const brief = text.trim();
    if (!brief) throw new ConvexError("VALIDATION:EMPTY_BRIEF: The model returned nothing. Try again.");
    await ctx.runMutation(internal.topics.setBrief, { id: args.topicId, brief });
    return { brief };
  },
});

/** Suggest three post angles (platform, format, story frame) for a topic. */
export const angles = action({
  args: { topicId: v.id("topics") },
  handler: async (ctx, args): Promise<{ angles: { platform: string; format: string; frameKey: string; title: string }[] }> => {
    const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
    if (!topic) throw new ConvexError("VALIDATION:TOPIC_NOT_FOUND: Topic not found.");
    const frames = await ctx.runQuery(api.frames.list, {});
    if (frames.length === 0) {
      throw new ConvexError("VALIDATION:NO_FRAMES: Add a story frame in the Library first.");
    }
    const { object } = await generateObject({
      model: llmModel(),
      system: SYSTEM,
      schema: anglesSchema,
      prompt: buildAnglesPrompt({
        title: topic.title,
        brief: topic.brief,
        frames: frames.map((f) => ({ key: f.key, name: f.name, fits: f.fits })),
      }),
    });
    const usable = usableAngles(object.angles, frames);
    if (usable.length === 0) {
      throw new ConvexError("VALIDATION:NO_ANGLES: The model suggested nothing usable. Try again.");
    }
    await ctx.runMutation(internal.topics.setAngles, { id: args.topicId, angles: usable });
    return { angles: usable };
  },
});
