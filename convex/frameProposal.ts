import { generateText } from "ai";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { buildTopicVars } from "./lib/drafting";
import { buildProposePrompt, parseProposal, PROPOSE_TEXT_MAX, PROPOSE_TEXT_MIN } from "./lib/frameProposal";
import type { FrameBeat, FrameFit } from "./lib/framesModel";
import { llmModel, withLlmErrors } from "./lib/llm";
import { operatorAction } from "./lib/operator";
import { refusal } from "./lib/slots";
import { voiceContextBlocks } from "./lib/voiceRules";

const fitArg = v.union(v.literal("thread"), v.literal("single"), v.literal("reel"), v.literal("carousel"));

/**
 * Propose a story frame (a name and 2 to 5 beats) for one format, from a topic's notes and sources or from a post the
 * founder pastes. Saves nothing: the founder edits the beats and saves them through `frames.save`, or walks away.
 * Give exactly one of `topicId` or `text`.
 */
export const propose = operatorAction({
  args: {
    fit: fitArg,
    topicId: v.optional(v.id("topics")),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ name: string; beats: FrameBeat[]; fit: FrameFit }> => {
    if ((args.topicId === undefined) === (args.text === undefined)) {
      throw refusal("BAD_PROPOSAL_SOURCE", "Choose a topic or paste a post, not both.");
    }

    let material: string;
    let source: "topic" | "post";
    if (args.topicId !== undefined) {
      const topic = await ctx.runQuery(api.topics.get, { id: args.topicId });
      if (!topic) throw refusal("TOPIC_NOT_FOUND", "That topic was not found. It may have been deleted.");
      const sources = await ctx.runQuery(api.sources.listByTopic, { topicId: args.topicId });
      const vars = buildTopicVars({
        title: topic.title,
        pillar: topic.pillar,
        notes: topic.notes,
        sourceUrl: topic.sourceUrl,
        brief: topic.brief,
        sources: sources.map((x) => ({ kind: x.kind, label: x.label, url: x.url, text: x.text })),
      });
      material = `Topic: ${vars.topic}\nNotes: ${vars.notes}\nSources: ${vars.sources}`;
      source = "topic";
    } else {
      const text = (args.text ?? "").trim();
      if (text.length < PROPOSE_TEXT_MIN) {
        throw refusal("POST_TOO_SHORT", `Paste at least ${PROPOSE_TEXT_MIN} characters of the post.`);
      }
      if (text.length > PROPOSE_TEXT_MAX) {
        throw refusal("POST_TOO_LONG", `Paste at most ${PROPOSE_TEXT_MAX.toLocaleString("en-US")} characters of the post.`);
      }
      material = text;
      source = "post";
    }

    const settings = await ctx.runQuery(api.settings.get, {});
    const { system, prompt } = buildProposePrompt({
      fit: args.fit,
      source,
      material,
      voiceBlocks: voiceContextBlocks(settings.voice),
    });
    const reply = await withLlmErrors(async () => (await generateText({ model: llmModel(), system, prompt })).text);
    const proposal = parseProposal(reply);
    if (!proposal) {
      throw refusal("BAD_PROPOSAL", "The AI model did not send back usable beats. Try again.");
    }
    return { ...proposal, fit: args.fit };
  },
});
