import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { newTest } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Stand in for the AI provider: answer every call with a short thread and keep what was sent. */
function fakeModel() {
  const sent: string[] = [];
  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        id: "cmpl-1",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content: "First post.\n---\nSecond post." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  return { impl, sent: () => sent.join("\n") };
}

async function topicWith(t: ReturnType<typeof newTest>, fields: { brief?: string; notes?: string }, withSources: boolean) {
  return await t.run(async (ctx) => {
    const topicId = await ctx.db.insert("topics", { title: "Per-post fees tax consistency", status: "drafting", createdAt: Date.now(), ...fields });
    if (withSources) {
      await ctx.db.insert("sources", { topicId, kind: "link", label: "developers.facebook.com", url: "https://developers.facebook.com/docs/threads", createdAt: 1 });
      await ctx.db.insert("sources", { topicId, kind: "quote", label: "Quote", text: "250 posts per 24 hours", createdAt: 2 });
    }
    return topicId;
  });
}

describe("what the model is given when Studio generates", () => {
  it("includes the research brief and the topic's sources", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");
    const fake = fakeModel();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    const topicId = await topicWith(t, { brief: "UNIQUE-BRIEF-TEXT: flat fees remove the per-post cost.", notes: "My own note." }, true);

    await t.action(api.drafting.generate, { topicId, formats: ["threads"] });

    const prompt = fake.sent();
    expect(prompt).toContain("UNIQUE-BRIEF-TEXT");
    expect(prompt).toContain("this is the main material, so stay within it");
    expect(prompt).toContain("My own note.");
    expect(prompt).toContain("developers.facebook.com");
    expect(prompt).toContain("250 posts per 24 hours");
  });

  it("works from the topic alone when there is no brief and no sources", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");
    const fake = fakeModel();
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    const topicId = await topicWith(t, { notes: "Only a note." }, false);

    await t.action(api.drafting.generate, { topicId, formats: ["threads"] });

    const prompt = fake.sent();
    expect(prompt).toContain("Only a note.");
    expect(prompt).toContain("(no linked sources)");
    expect(prompt).not.toContain("this is the main material");
  });
});
