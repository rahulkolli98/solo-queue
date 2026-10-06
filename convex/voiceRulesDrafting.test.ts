import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Stand in for the AI provider: answer every call with `content` and keep what was sent. */
function fakeModel(content: string) {
  const sent: string[] = [];
  const impl = vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        id: "cmpl-1",
        object: "chat.completion",
        created: 1,
        model: "test-model",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubGlobal("fetch", impl);
  return { sent: () => sent.join("\n") };
}

/** A settings patch replaces the whole voice section, so send the current one with the change. */
async function setVoice(t: TestConvex, change: Record<string, unknown>) {
  const { voice } = await t.query(api.settings.get, {});
  await t.mutation(api.settings.update, { patch: { voice: { ...voice, ...change } } });
}

async function bodyOf(t: TestConvex, platform: "threads" | "instagram", templateKey: string): Promise<string | undefined> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("drafts").collect();
    return rows.find((d) => d.platform === platform && d.templateKey === templateKey)?.body;
  });
}

const THREAD = "First post.\n---\nSecond post.";

describe("voice sign-off", () => {
  it("is added to the last post only, and changing the setting changes the draft", async () => {
    fakeModel(THREAD);
    const t = newTest();
    const topic = await insertTopic(t, "A topic");

    await setVoice(t, { signOff: "- Rahul" });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(await bodyOf(t, "threads", "threads-hook-story")).toBe("First post.\n---\nSecond post.\n\n- Rahul");

    await setVoice(t, { signOff: "Built in public." });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(await bodyOf(t, "threads", "threads-hook-story")).toBe("First post.\n---\nSecond post.\n\nBuilt in public.");

    await setVoice(t, { signOff: "" });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(await bodyOf(t, "threads", "threads-hook-story")).toBe(THREAD);
  });

  it("is left off when it would push the last post past 500 characters", async () => {
    const long = "x".repeat(499);
    fakeModel(`Short.\n---\n${long}`);
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await setVoice(t, { signOff: "- Rahul" });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(await bodyOf(t, "threads", "threads-hook-story")).toBe(`Short.\n---\n${long}`);
  });

  it("does not touch a draft the founder writes (drafts.createManual)", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await setVoice(t, { signOff: "- Rahul" });
    await t.mutation(internal.templates.ensureDefaults, {});
    await t.mutation(api.drafts.createManual, { topicId: topic, kind: "threads", body: "Mine." });
    expect(await bodyOf(t, "threads", "threads-hook-story")).toBe("Mine.");
  });
});

describe("Instagram hashtag cap", () => {
  const CAPTION = "Great post about builds.\n\n#a #b #c #d #e #f";

  it("caps the stored caption and tells the model the maximum", async () => {
    const fake = fakeModel(CAPTION);
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await setVoice(t, { igHashtagMax: 2 });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-caption"] });
    expect(await bodyOf(t, "instagram", "ig-caption-beats")).toBe("Great post about builds.\n\n#a #b");
    expect(fake.sent()).toContain("Use at most 2 hashtags (this overrides any hashtag count above).");
  });

  it("changing the cap changes the result (0 removes all, and the prompt says so)", async () => {
    const fake = fakeModel(CAPTION);
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await setVoice(t, { igHashtagMax: 4 });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-caption"] });
    expect(await bodyOf(t, "instagram", "ig-caption-beats")).toBe("Great post about builds.\n\n#a #b #c #d");

    await setVoice(t, { igHashtagMax: 0 });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-caption"] });
    expect(await bodyOf(t, "instagram", "ig-caption-beats")).toBe("Great post about builds.");
    expect(fake.sent()).toContain("Do not use any hashtags (this overrides");
  });

  it("caps the caption line of a reel draft but not its script", async () => {
    fakeModel("0:00 On screen: a #hook in the script\n---\nCaption #a #b #c");
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await setVoice(t, { igHashtagMax: 1 });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-reel"] });
    expect(await bodyOf(t, "instagram", "reel-script")).toBe("0:00 On screen: a #hook in the script\n---\nCaption #a");
  });

  it("does not put the hashtag line in a Threads prompt", async () => {
    const fake = fakeModel(THREAD);
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(fake.sent()).not.toContain("hashtags (this overrides");
  });
});
