import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { carouselInstructions } from "./lib/carouselDraft";
import { CAROUSEL_TARGETS, resolveTargets, withFormatDefault } from "./lib/formatSetup";
import { insertDraft, insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SLIDES = [
  { layout: "cards", tone: "coral", kicker: "TIP", headline: "Stop cross-posting.", accent: "posting.", sub: "One idea." },
  { layout: "cards", tone: "ink", headline: "Two drafts.", cards: [{ label: "THREADS", big: "500", text: "characters.", tone: "cream" }] },
  { layout: "cover", tone: "yellow", headline: "End.", sub: "Follow.", pills: ["Follow", "Save", "Share"] },
];
const REPLY = JSON.stringify({ caption: "The Instagram caption.", slides: SLIDES });

function fakeModel(content: string) {
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
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
  return { bodies };
}

async function seeded() {
  const t = newTest();
  await t.mutation(api.frames.ensureDefaults, {});
  return { t, topic: await insertTopic(t, "A topic") };
}
const carouselDraft = (t: TestConvex) =>
  t.run(async (ctx) => (await ctx.db.query("drafts").collect()).filter((d) => d.templateKey === "carousel-slides").at(-1));
const carouselRun = (t: TestConvex, topic: Id<"topics">, targets?: ("instagram" | "threads")[]) =>
  t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3, ...(targets ? { targets } : {}) } } });

describe("the prompt no longer asks for a separate Threads text", () => {
  it("is the same whether or not the carousel goes to Threads", () => {
    expect(carouselInstructions({ count: 3 })).not.toContain("threadsText");
    expect(carouselInstructions({ count: 1 })).not.toContain("threadsText");
  });
});

describe("resolveTargets", () => {
  it("uses this run's pick, then the saved default, then Instagram only; never an empty list", () => {
    expect(resolveTargets({})).toEqual(["instagram"]);
    expect(resolveTargets({ defaults: { carousel: { targets: ["threads"] } } })).toEqual(["threads"]);
    expect(resolveTargets({ defaults: { carousel: { targets: ["threads"] } }, picked: ["instagram", "threads"] })).toEqual(["instagram", "threads"]);
    expect(resolveTargets({ picked: [] })).toEqual(["instagram"]);
    expect(resolveTargets({ picked: ["threads", "instagram"] })).toEqual([...CAROUSEL_TARGETS]);
  });

  it("is saved with the carousel's other defaults and removed with null", () => {
    const saved = withFormatDefault(undefined, "carousel", { targets: ["instagram", "threads"], count: 6 });
    expect(saved).toEqual({ carousel: { targets: ["instagram", "threads"], count: 6 } });
    expect(withFormatDefault(saved, "carousel", { targets: null })).toEqual({ carousel: { count: 6 } });
  });
});

describe("a carousel set to go to Threads goes on its thread's first post", () => {
  it("links the new carousel to the topic's thread when this run says Threads", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    const thread = await insertDraft(t, topic, "threads", "One.\n---\nTwo.", "threads-hook-story");
    await carouselRun(t, topic, ["instagram", "threads"]);
    const car = await carouselDraft(t);
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBe(car?._id);
    // The carousel itself has no Threads text any more: its caption is the Instagram caption.
    expect(car?.body).toBe("The Instagram caption.");
  });

  it("does not link when the run is Instagram only, or when there is no thread yet", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    const thread = await insertDraft(t, topic, "threads", "One.\n---\nTwo.", "threads-hook-story");
    await carouselRun(t, topic, ["instagram"]);
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBeUndefined();

    const other = await seeded();
    await carouselRun(other.t, other.topic, ["threads"]);
    expect(await carouselDraft(other.t)).toBeDefined();
  });

  it("follows the saved default, and a run that says Instagram only overrides it", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    const thread = await insertDraft(t, topic, "threads", "One.\n---\nTwo.", "threads-hook-story");
    const { voice } = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { targets: ["instagram", "threads"] } } } } });
    await carouselRun(t, topic);
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBeDefined();
    await t.mutation(api.drafts.setCarousel, { id: thread, carouselDraftId: null });
    await carouselRun(t, topic, ["instagram"]);
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBeUndefined();
  });

  it("leaves a thread that already has a post alone", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    const thread = await insertDraft(t, topic, "threads", "One.\n---\nTwo.", "threads-hook-story");
    await insertSlot(t, thread, Date.now() - 3600_000, { platform: "threads", status: "published" });
    await carouselRun(t, topic, ["instagram", "threads"]);
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBeUndefined();
  });

  it("regenerating the carousel moves the first post's carousel to the new one, and the old images are not carried", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    const thread = await insertDraft(t, topic, "threads", "One.\n---\nTwo.", "threads-hook-story");
    await carouselRun(t, topic, ["instagram", "threads"]);
    const first = await carouselDraft(t);
    await carouselRun(t, topic, ["instagram", "threads"]);
    const second = await carouselDraft(t);
    expect(second?._id).not.toBe(first?._id);
    expect(await t.run((ctx) => ctx.db.get(first!._id))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(thread)))?.carouselDraftId).toBe(second?._id);
  });

  it("a thread written again keeps the carousel on its first post", async () => {
    const { t, topic } = await seeded();
    const car = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        topicId: topic,
        platform: "instagram",
        body: "Caption",
        templateKey: "carousel-slides",
        templateVersion: 1,
        format: "carousel",
        slides: [{ layout: "cover", tone: "cream", headline: "A" }, { layout: "close", tone: "ink", headline: "B" }],
        charCount: 7,
        constraintOk: true,
        createdAt: Date.now(),
      })
    );
    const thread = await insertDraft(t, topic, "threads", "Old one.\n---\nOld two.", "threads-hook-story");
    await t.mutation(api.drafts.setCarousel, { id: thread, carouselDraftId: car });
    // The thread is replaced the way a regenerate replaces it.
    const next = await t.mutation(internal.drafting.storeDraft, {
      topicId: topic,
      platform: "threads",
      templateKey: "threads-hook-story",
      templateVersion: 1,
      body: "New one.\n---\nNew two.",
      charCount: 20,
      constraintOk: true,
    });
    const row = await t.run((ctx) => ctx.db.get(next as Id<"drafts">));
    expect(row?.carouselDraftId).toBe(car);
    expect(await t.run((ctx) => ctx.db.get(thread))).toBeNull();
  });

  it("refuses an unknown platform or an empty list in the saved settings", async () => {
    const { t } = await seeded();
    const { voice } = await t.query(api.settings.get, {});
    await expect(
      t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { targets: ["tiktok"] } } } } })
    ).rejects.toThrow(/INVALID_SETTINGS/);
    await expect(
      t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { targets: [] } } } } })
    ).rejects.toThrow(/INVALID_SETTINGS/);
  });
});


describe("writing only the thread again", () => {
  async function postedThreadAndCarousel(t: TestConvex, topic: Id<"topics">) {
    const car = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        topicId: topic,
        platform: "instagram",
        body: "Caption",
        templateKey: "carousel-slides",
        templateVersion: 1,
        format: "carousel",
        slides: [{ layout: "cover", tone: "cream", headline: "A" }, { layout: "close", tone: "ink", headline: "B" }],
        charCount: 7,
        constraintOk: true,
        createdAt: Date.now(),
      })
    );
    const posted = await insertDraft(t, topic, "threads", "Old one.\n---\nOld two.", "threads-hook-story");
    await t.mutation(api.drafts.setCarousel, { id: posted, carouselDraftId: car });
    await insertSlot(t, posted, Date.now() - 3600_000, { platform: "threads", status: "published" });
    return { car, posted };
  }
  const threadRun = (t: TestConvex, topic: Id<"topics">) => t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
  const newestThread = (t: TestConvex) =>
    t.run(async (ctx) => (await ctx.db.query("drafts").collect()).filter((d) => d.templateKey === "threads-hook-story").sort((a, b) => a.createdAt - b.createdAt).at(-1));

  it("the new version starts with the carousel on its first post when the saved default says Threads, and the posted one is kept", async () => {
    fakeModel("A new thread.\n---\nSecond post.");
    const { t, topic } = await seeded();
    const { car, posted } = await postedThreadAndCarousel(t, topic);
    const { voice } = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { targets: ["instagram", "threads"] } } } } });
    await threadRun(t, topic);
    const next = await newestThread(t);
    expect(next?._id).not.toBe(posted);
    expect(next?.carouselDraftId).toBe(car);
    // The one that already went out is still there, untouched.
    expect(await t.run((ctx) => ctx.db.get(posted))).not.toBeNull();
  });

  it("starts as text only when the saved default is Instagram only", async () => {
    fakeModel("A new thread.\n---\nSecond post.");
    const { t, topic } = await seeded();
    await postedThreadAndCarousel(t, topic);
    await threadRun(t, topic);
    expect((await newestThread(t))?.carouselDraftId).toBeUndefined();
  });
});

describe("a run is marked on the topic, so a screen opened later still shows it", () => {
  it("clears the mark when the run succeeds", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    await carouselRun(t, topic);
    expect((await t.run((ctx) => ctx.db.get(topic)))?.generation).toBeUndefined();
  });

  it("keeps the reason when the run fails, and the next run clears it", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })));
    const { t, topic } = await seeded();
    await expect(carouselRun(t, topic)).rejects.toThrow();
    const failed = (await t.run((ctx) => ctx.db.get(topic)))?.generation;
    expect(failed).toMatchObject({ status: "failed", kinds: ["instagram-carousel"] });
    expect(failed?.error?.length).toBeGreaterThan(0);

    fakeModel(REPLY);
    await carouselRun(t, topic);
    expect((await t.run((ctx) => ctx.db.get(topic)))?.generation).toBeUndefined();
  });

  it("a refused run (a bad slide count) is recorded too, with its code", async () => {
    fakeModel(REPLY);
    const { t, topic } = await seeded();
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 12 } } })).rejects.toThrow(/BAD_SLIDE_COUNT/);
    expect((await t.run((ctx) => ctx.db.get(topic)))?.generation).toMatchObject({ status: "failed", errorCode: "BAD_SLIDE_COUNT" });
  });
});
