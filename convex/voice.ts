import { postText } from "./lib/postText";
import { generateText } from "ai";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { instagramCaption, splitPosts } from "./lib/drafting";
import { llmModel, withLlmErrors } from "./lib/llm";
import { operatorAction } from "./lib/operator";
import { refusal } from "./lib/slots";
import { SUGGEST_POST_LIMIT, buildVoiceSuggestPrompt, cleanDescription } from "./lib/voiceRules";

/**
 * The text of the founder's most recent published posts, newest first: what
 * actually went out (a thread's posts, an Instagram caption), not the
 * template's counter lines. Internal: only `suggest` reads it.
 */
export const recentPublishedText = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<string[]> => {
    const slots = await ctx.db
      .query("slots")
      .withIndex("by_status_and_publishedAt", (q) => q.eq("status", "published"))
      .order("desc")
      .take(args.limit * 3); // some published slots point at a draft that was since deleted
    const texts: string[] = [];
    for (const slot of slots) {
      if (texts.length >= args.limit) break;
      const draft = await ctx.db.get(slot.draftId);
      if (!draft) continue;
      const text =
        slot.platform === "instagram"
          ? instagramCaption(draft.templateKey, draft.body)
          : splitPosts(postText(draft, "threads")).join("\n\n");
      if (text.trim()) texts.push(text.trim());
    }
    return texts;
  },
});

/**
 * Propose a new voice description from the founder's published posts (up to
 * the 20 most recent). Saves nothing: the founder reads it in Settings and
 * accepts it (which saves through `settings.update`) or ignores it.
 */
export const suggest = operatorAction({
  args: {},
  handler: async (ctx): Promise<{ description: string; basedOn: number }> => {
    const posts: string[] = await ctx.runQuery(internal.voice.recentPublishedText, { limit: SUGGEST_POST_LIMIT });
    if (posts.length === 0) {
      throw refusal("NO_POSTS", "Publish a post first, then Solo Queue can learn from it.");
    }
    const settings = await ctx.runQuery(api.settings.get, {});
    const { system, prompt } = buildVoiceSuggestPrompt(settings.voice.description, posts);
    const text = await withLlmErrors(async () => {
      const result = await generateText({ model: llmModel(), system, prompt });
      return result.text;
    });
    const description = cleanDescription(text);
    if (!description) {
      throw refusal("EMPTY_SUGGESTION", "The AI model sent back nothing. Try again.");
    }
    return { description, basedOn: posts.length };
  },
});
