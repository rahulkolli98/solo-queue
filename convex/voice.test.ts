import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { VOICE_DESCRIPTION_MAX } from "./lib/voiceRules";
import { insertDraft, insertSlot, insertTopic, newAnonymousTest, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
  return { calls: impl, sent: () => sent.join("\n") };
}

async function publish(
  t: TestConvex,
  body: string,
  at: number,
  extra: { platform?: "threads" | "instagram"; status?: "published" | "scheduled"; templateKey?: string } = {}
) {
  const topic = await insertTopic(t, "A topic");
  const platform = extra.platform ?? "threads";
  const draft = await insertDraft(t, topic, platform, body, extra.templateKey);
  const slot = await insertSlot(t, draft, at, { platform, status: extra.status ?? "published" });
  if ((extra.status ?? "published") === "published") await t.run(async (ctx) => ctx.db.patch(slot, { publishedAt: at }));
}

const data = (e: unknown) => String((e as ConvexError<string>).data);

describe("voice.suggest", () => {
  it("refuses when nothing has been published, without calling the model", async () => {
    const fake = fakeModel("Never used.");
    const t = newTest();
    await publish(t, "Only scheduled.", 100, { status: "scheduled" });
    const err = await t.action(api.voice.suggest, {}).catch((e: unknown) => e);
    expect(data(err)).toBe("VALIDATION:NO_POSTS: Publish a post first, then Solo Queue can learn from it.");
    expect(fake.calls).not.toHaveBeenCalled();
  });

  it("is refused for a caller who is not the operator", async () => {
    fakeModel("x");
    const err = await newAnonymousTest().action(api.voice.suggest, {}).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^UNAUTHENTICATED:/);
  });

  it("returns a suggestion built from the published posts and the current description, and saves nothing", async () => {
    const fake = fakeModel('"Plain and short. Say what happened and what it cost."');
    const t = newTest();
    await publish(t, "UNIQUE-POST-ONE\n---\nsecond half", 100);
    await publish(t, "UNIQUE-POST-TWO", 200);
    const before = await t.query(api.settings.get, {});

    const result = await t.action(api.voice.suggest, {});

    expect(result).toEqual({ description: "Plain and short. Say what happened and what it cost.", basedOn: 2 });
    const prompt = fake.sent();
    expect(prompt).toContain("UNIQUE-POST-ONE");
    expect(prompt).toContain("UNIQUE-POST-TWO");
    expect(prompt).toContain(before.voice.description);
    expect(prompt).toContain("600");
    // Newest first.
    expect(prompt.indexOf("UNIQUE-POST-TWO")).toBeLessThan(prompt.indexOf("UNIQUE-POST-ONE"));
    // Nothing was saved: the founder accepts it in Settings.
    expect((await t.query(api.settings.get, {})).voice).toEqual(before.voice);
  });

  it("clamps a long answer to 600 characters", async () => {
    fakeModel(`  ${"word ".repeat(300)}  `);
    const t = newTest();
    await publish(t, "A post", 100);
    const { description } = await t.action(api.voice.suggest, {});
    expect(description.length).toBeLessThanOrEqual(VOICE_DESCRIPTION_MAX);
    expect(description.length).toBeGreaterThan(500);
    expect(description).toBe(description.trim());
  });

  it("reads only the 20 most recent published posts, and sends an Instagram caption without its counter footer", async () => {
    const fake = fakeModel("A voice.");
    const t = newTest();
    for (let i = 1; i <= 22; i++) await publish(t, `POST-NUMBER-${String(i).padStart(2, "0")}-END`, i * 1000);
    await publish(t, "The caption text.\n---\nCAPTION · 17 / 2,200", 99_000, { platform: "instagram", templateKey: "ig-caption-beats" });

    const { basedOn } = await t.action(api.voice.suggest, {});

    expect(basedOn).toBe(20);
    const prompt = fake.sent();
    expect(prompt).toContain("POST-NUMBER-22-END");
    expect(prompt).toContain("POST-NUMBER-04-END");
    expect(prompt).not.toContain("POST-NUMBER-03-END");
    expect(prompt).toContain("The caption text.");
    expect(prompt).not.toContain("2,200");
  });

  it("reports a model failure as a readable refusal", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const t = newTest();
    await publish(t, "A post", 100);
    const err = await t.action(api.voice.suggest, {}).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^VALIDATION:LLM_/);
  });
});
