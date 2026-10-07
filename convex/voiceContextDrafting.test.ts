import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";
import { voiceContextBlocks } from "./lib/voiceRules";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Stand in for the AI provider and keep the system prompt of every call. */
function fakeModel() {
  const systems: string[] = [];
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
      systems.push((body.messages ?? []).filter((m) => m.role === "system").map((m) => m.content).join("\n"));
      return new Response(
        JSON.stringify({
          id: "cmpl-1",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [{ index: 0, message: { role: "assistant", content: "One.\n---\nTwo." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
  return { systems };
}

async function setVoice(t: TestConvex, change: Record<string, unknown>) {
  const { voice } = await t.query(api.settings.get, {});
  await t.mutation(api.settings.update, { patch: { voice: { ...voice, ...change } } });
}

describe("voiceContextBlocks", () => {
  it("adds nothing for blank or missing text", () => {
    expect(voiceContextBlocks({})).toEqual([]);
    expect(voiceContextBlocks({ aboutMe: "  ", styleGuide: "\n" })).toEqual([]);
  });

  it("labels each block and trims it", () => {
    const blocks = voiceContextBlocks({ aboutMe: " Solo founder. ", styleGuide: " Short lines. " });
    expect(blocks).toEqual([
      "About the founder:\nSolo founder.",
      "Style guide (match how they write, not what they say):\nShort lines.",
    ]);
  });
});

describe("about you and style guide reach the model", () => {
  it("are sent with every format, in front of the banned words, and a changed setting changes the request", async () => {
    const model = fakeModel();
    const t = newTest();
    const topic = await insertTopic(t, "A topic");

    await setVoice(t, { aboutMe: "I build a scheduler alone.", styleGuide: "Open with a confession. One idea per line." });
    await t.action(api.drafting.generate, { topicId: topic });
    // One call per format; the carousel-style structured call may retry as text, so allow extra.
    expect(model.systems.length).toBeGreaterThanOrEqual(4);
    for (const system of model.systems) {
      expect(system).toContain("About the founder:\nI build a scheduler alone.");
      expect(system).toContain("Style guide (match how they write, not what they say):\nOpen with a confession. One idea per line.");
      expect(system.indexOf("About the founder:")).toBeLessThan(system.indexOf("Style guide"));
      const banned = system.search(/never use|banned|Never use/i);
      if (banned >= 0) expect(system.indexOf("Style guide")).toBeLessThan(banned);
    }

    model.systems.length = 0;
    await setVoice(t, { styleGuide: "Be warm. Ask a question at the end." });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(model.systems[0]).toContain("Be warm. Ask a question at the end.");
    expect(model.systems[0]).not.toContain("Open with a confession.");
  });

  it("add nothing when left blank", async () => {
    const model = fakeModel();
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(model.systems[0]).not.toContain("About the founder");
    expect(model.systems[0]).not.toContain("Style guide");
  });

  it("are refused when too long, and survive a round trip through settings", async () => {
    const t = newTest();
    await setVoice(t, { aboutMe: "Me", styleGuide: "Guide" });
    const got = await t.query(api.settings.get, {});
    expect(got.voice.aboutMe).toBe("Me");
    expect(got.voice.styleGuide).toBe("Guide");
    await expect(setVoice(t, { styleGuide: "x".repeat(20001) })).rejects.toThrow(/INVALID_SETTINGS: voice/);
  });
});
