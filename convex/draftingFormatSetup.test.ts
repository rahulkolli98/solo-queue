import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Stand in for the AI provider and keep every request body. */
function fakeModel() {
  const bodies: string[] = [];
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(
        JSON.stringify({
          id: "cmpl-1",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [{ index: 0, message: { role: "assistant", content: "One.\n---\nTwo.\n---\nThree." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
  return { bodies };
}

async function setVoice(t: TestConvex, change: Record<string, unknown>) {
  const { voice } = await t.query(api.settings.get, {});
  await t.mutation(api.settings.update, { patch: { voice: { ...voice, ...change } } });
}

/** templateKey -> frameKey of every stored draft. */
async function framesUsed(t: TestConvex): Promise<Record<string, string | undefined>> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("drafts").collect();
    return Object.fromEntries(rows.map((d) => [d.templateKey, d.frameKey]));
  });
}

async function seeded() {
  const t = newTest();
  await t.mutation(api.frames.ensureDefaults, {});
  const topic = await insertTopic(t, "A topic");
  return { t, topic };
}

describe("generate: per-format setup", () => {
  it("writes only the chosen formats and leaves the others alone", async () => {
    const model = fakeModel();
    const { t, topic } = await seeded();
    const out = await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-caption"] });
    expect(out.drafts.map((d) => d.format)).toEqual(["instagram-caption"]);
    expect(model.bodies).toHaveLength(1);
    expect(Object.keys(await framesUsed(t))).toEqual(["ig-caption-beats"]);
  });

  it("uses a different frame for each format, from this run's setup", async () => {
    const model = fakeModel();
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["threads", "instagram-caption", "instagram-reel"],
      setup: {
        threads: { frameKey: "hot-take" },
        caption: { frameKey: "receipt" },
        reel: { frameKey: "teardown" },
      },
    });
    expect(await framesUsed(t)).toEqual({
      "threads-hook-story": "hot-take",
      "ig-caption-beats": "receipt",
      "reel-script": "teardown",
    });
    // The frame's beats reached the request for each format.
    const all = model.bodies.join("\n");
    expect(all).toContain("Story frame");
    expect(all).toContain("Hot take");
    expect(all).toContain("The receipt");
    expect(all).toContain("Teardown");
  });

  it("refuses a frame that does not fit its format, before calling the model", async () => {
    const model = fakeModel();
    const { t, topic } = await seeded();
    await expect(
      t.action(api.drafting.generate, {
        topicId: topic,
        formats: ["instagram-caption"],
        setup: { caption: { frameKey: "hot-take" } },
      })
    ).rejects.toThrow(/FRAME_DOESNT_FIT/);
    expect(model.bodies).toHaveLength(0);
    await expect(
      t.action(api.drafting.generate, {
        topicId: topic,
        formats: ["threads"],
        setup: { threads: { frameKey: "no-such-frame" } },
      })
    ).rejects.toThrow(/FRAME_NOT_FOUND/);
  });

  it("refuses an empty list of formats", async () => {
    fakeModel();
    const { t, topic } = await seeded();
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: [] })).rejects.toThrow(/NO_FORMATS/);
  });

  it("uses the saved default for each format, then the older single default, then the seeded frame", async () => {
    fakeModel();
    const { t, topic } = await seeded();
    // Older settings: only the single default (confession fits threads and reels, not captions).
    await t.action(api.drafting.generate, { topicId: topic });
    expect(await framesUsed(t)).toMatchObject({
      "threads-hook-story": "confession",
      "reel-script": "confession",
      "ig-caption-beats": "ig-caption",
    });
    expect((await framesUsed(t))["blog-draft"]).toBeUndefined();

    await setVoice(t, { formatDefaults: { threads: { frameKey: "hot-take" }, reel: { frameKey: "ig-reel" } } });
    await t.action(api.drafting.generate, { topicId: topic });
    expect(await framesUsed(t)).toMatchObject({
      "threads-hook-story": "hot-take",
      "reel-script": "ig-reel",
      "ig-caption-beats": "ig-caption",
    });
  });

  it("this run's choice beats the saved default, and a saved thread length is used", async () => {
    const model = fakeModel();
    const { t, topic } = await seeded();
    await setVoice(t, { formatDefaults: { threads: { frameKey: "hot-take", count: 6 } } });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    expect(model.bodies.join("\n")).toContain("Write exactly 6 posts");
    expect(await framesUsed(t)).toMatchObject({ "threads-hook-story": "hot-take" });

    model.bodies.length = 0;
    await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["threads"],
      setup: { threads: { frameKey: "confession", count: 3 } },
    });
    expect(model.bodies.join("\n")).toContain("Write exactly 3 posts");
    expect(model.bodies.join("\n")).not.toContain("Write exactly 6 posts");
    expect(await framesUsed(t)).toMatchObject({ "threads-hook-story": "confession" });
  });

  it("keeps the older single frameKey argument working: one frame, only where it fits", async () => {
    fakeModel();
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, frameKey: "teardown" });
    expect(await framesUsed(t)).toEqual({
      "threads-hook-story": undefined,
      "ig-caption-beats": undefined,
      "reel-script": "teardown",
      "blog-draft": undefined,
    });
  });

  it("settings keep the per-format defaults through a round trip and refuse a bad count", async () => {
    const t = newTest();
    await setVoice(t, { formatDefaults: { threads: { include: true, frameKey: "hot-take", count: 5 }, blog: { include: false } } });
    const got = await t.query(api.settings.get, {});
    expect(got.voice.formatDefaults).toEqual({ threads: { include: true, frameKey: "hot-take", count: 5 }, blog: { include: false } });
    await expect(setVoice(t, { formatDefaults: { threads: { count: 40 } } })).rejects.toThrow(/INVALID_SETTINGS: voice/);
  });
});
