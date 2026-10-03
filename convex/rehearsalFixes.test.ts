import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import { llmFailure } from "./lib/llm";
import { judgeMedia } from "./lib/http";
import { V1_TEMPLATES } from "./templateCopy";
import { hasPlaceholder } from "./lib/drafting";
import { insertDraft, insertTopic, newTest } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const data = (e: unknown) => String((e as ConvexError<string>).data);

describe("templates are seeded on demand", () => {
  it("inserts every built-in template once and never overrides a saved one", async () => {
    const t = newTest();
    const first = await t.mutation(internal.templates.ensureDefaults, {});
    expect(first.inserted).toBe(V1_TEMPLATES.length);
    expect((await t.query(api.templates.list, {})).length).toBe(V1_TEMPLATES.length);
    expect((await t.mutation(internal.templates.ensureDefaults, {})).inserted).toBe(0);

    await t.mutation(api.templates.saveVersion, { key: "threads-hook-story", body: "My own copy {{topic}}" });
    await t.mutation(internal.templates.ensureDefaults, {});
    const mine = (await t.query(api.templates.list, {})).find((x) => x.key === "threads-hook-story");
    expect(mine?.body).toBe("My own copy {{topic}}");
  });

  it("generation no longer stops on a missing template; it reports the AI setup instead", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_MODEL", "");
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const err = await t.action(api.drafting.generate, { topicId: topic }).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^VALIDATION:LLM_NOT_CONFIGURED/);
    expect((await t.query(api.templates.list, {})).length).toBe(V1_TEMPLATES.length);
  });

  it("the research brief reports the AI setup the same way", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("LLM_MODEL", "");
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const err = await t.action(api.research.brief, { topicId: topic }).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^VALIDATION:LLM_NOT_CONFIGURED/);
  });
});

describe("llmFailure", () => {
  const apiError = (message: string, statusCode?: number) => Object.assign(new Error(message), { name: "AI_APICallError", statusCode });

  it("explains the OpenRouter privacy block and where to change it", () => {
    const err = llmFailure(
      apiError("0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. Paid model training violation", 404)
    );
    expect(data(err)).toMatch(/^VALIDATION:LLM_PRIVACY: .*openrouter\.ai\/settings\/privacy/);
  });

  it("maps keys, credits, unknown model and rate limits to plain advice", () => {
    expect(data(llmFailure(apiError("nope", 401)))).toMatch(/LLM_AUTH/);
    expect(data(llmFailure(apiError("nope", 402)))).toMatch(/LLM_CREDITS/);
    expect(data(llmFailure(apiError("nope", 404)))).toMatch(/LLM_MODEL/);
    expect(data(llmFailure(apiError("nope", 429)))).toMatch(/LLM_RATE_LIMIT/);
  });

  it("keeps a key out of any message and passes existing refusals through", () => {
    const text = data(llmFailure(apiError("bad request for sk-or-v1-abcdef1234567890abcdef", 400)));
    expect(text).toContain("LLM_ERROR");
    expect(text).not.toContain("abcdef1234567890");
    const own = new ConvexError("VALIDATION:BRIEF_EDITED: x");
    expect(llmFailure(own)).toBe(own);
  });
});

describe("media verification needs a real image or video file", () => {
  async function asset(t: ReturnType<typeof newTest>, url: string, mimeType = "video/mp4") {
    return await t.run(async (ctx) =>
      ctx.db.insert("mediaAssets", { storageId: `external:${url}`, publicUrl: url, mimeType, createdAt: Date.now() })
    );
  }
  const page = (type: string) => vi.fn(async () => new Response(null, { status: 200, headers: { "content-type": type } }));

  it("refuses a web page such as a YouTube link, says why, and stores the reason", async () => {
    vi.stubGlobal("fetch", page("text/html; charset=utf-8"));
    const t = newTest();
    const id = await asset(t, "https://www.youtube.com/watch?v=abc123");
    await expect(t.action(api.media.verify, { id })).rejects.toThrow(/not an image or video file/);
    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.verifiedAt).toBeUndefined();
    expect(row?.lastVerifyError).toMatch(/YouTube, Vimeo or Google Drive/);
  });

  it("accepts a real file and records the type the server reports", async () => {
    vi.stubGlobal("fetch", page("image/png"));
    const t = newTest();
    const id = await asset(t, "https://cdn.example.com/photo", "video/mp4");
    await t.action(api.media.verify, { id });
    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.verifiedAt).toBeTypeOf("number");
    expect(row?.mimeType).toBe("image/png");
  });

  it("judgeMedia accepts octet-stream only for a media file name", () => {
    expect(judgeMedia("https://cdn.example.com/a.mp4", { status: 200, contentType: "application/octet-stream" })).toEqual({
      ok: true,
      mimeType: "video/mp4",
    });
    expect(judgeMedia("https://cdn.example.com/download", { status: 200, contentType: "application/octet-stream" }).ok).toBe(false);
    expect(judgeMedia("https://cdn.example.com/a.jpg", { status: 200, contentType: "text/html" }).ok).toBe(false);
  });
});

describe("placeholders must be filled in before anything is queued or posted", () => {
  it("refuses to queue a draft that still has a [[placeholder]]", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const draft = await insertDraft(t, topic, "threads", "It cost me [[your number]] last month.");
    const err = await t.mutation(api.slots.enqueue, { draftId: draft }).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^VALIDATION:PLACEHOLDER/);
    await t.mutation(api.drafts.update, { id: draft, body: "It cost me plenty last month." });
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).resolves.toBeTruthy();
  });

  it("hasPlaceholder only matches the double-bracket marker", () => {
    expect(hasPlaceholder("Costs [[your number]] a month")).toBe(true);
    expect(hasPlaceholder("See [1] and [link] below")).toBe(false);
  });
});

describe("publishLog.mode", () => {
  it("reports dry run unless PUBLISH_DRY_RUN is exactly 0", async () => {
    const t = newTest();
    expect(await t.query(api.publishLog.mode, {})).toEqual({ mode: "dry-run", paused: false });
    vi.stubEnv("PUBLISH_DRY_RUN", "true");
    expect((await t.query(api.publishLog.mode, {})).mode).toBe("dry-run");
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    expect((await t.query(api.publishLog.mode, {})).mode).toBe("live");
  });
});
