import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { carouselInstructions, parseCarousel, THREADS_TEXT_MAX } from "./lib/carouselDraft";
import { CAROUSEL_TARGETS, resolveTargets, withFormatDefault } from "./lib/formatSetup";
import { insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SLIDES = [
  { layout: "cards", tone: "coral", kicker: "TIP", headline: "Stop cross-posting.", accent: "posting.", sub: "One idea." },
  { layout: "cards", tone: "ink", headline: "Two drafts.", cards: [{ label: "THREADS", big: "500", text: "characters.", tone: "cream" }] },
  { layout: "cover", tone: "yellow", headline: "End.", sub: "Follow.", pills: ["Follow", "Save", "Share"] },
];
const reply = (extra: Record<string, unknown> = {}) => JSON.stringify({ caption: "The Instagram caption.", slides: SLIDES, ...extra });

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
  t.run(async (ctx) => (await ctx.db.query("drafts").collect()).find((d) => d.templateKey === "carousel-slides"));

describe("the Threads text in a carousel reply", () => {
  it("is read, trimmed and cut to 500 characters, and is absent when the model sent none", () => {
    expect(parseCarousel(reply({ threadsText: "  One idea for Threads.  " }), 3)?.threadsText).toBe("One idea for Threads.");
    const long = parseCarousel(reply({ threadsText: `${"A sentence that goes on. ".repeat(40)}` }), 3)?.threadsText ?? "";
    expect(long.length).toBeLessThanOrEqual(THREADS_TEXT_MAX);
    expect(long.length).toBeGreaterThan(300);
    expect(long.endsWith(".")).toBe(true);
    expect(parseCarousel(reply(), 3)).not.toHaveProperty("threadsText");
    expect(parseCarousel(reply({ threadsText: "   " }), 3)).not.toHaveProperty("threadsText");
  });
});

describe("the prompt", () => {
  it("asks for a Threads text only when the carousel also goes to Threads", () => {
    expect(carouselInstructions({ count: 3 })).not.toContain("threadsText");
    const text = carouselInstructions({ count: 3, threads: true });
    expect(text).toContain('"threadsText"');
    expect(text).toContain("500 characters");
    expect(text).toContain("No hashtags");
    expect(carouselInstructions({ count: 1, threads: true })).toContain('"threadsText"');
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

describe("generating a carousel for Threads", () => {
  it("stores the Threads text on the carousel when this run says so, and asks the model for it", async () => {
    const model = fakeModel(reply({ threadsText: "Words for Threads." }));
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3, targets: ["instagram", "threads"] } } });
    const draft = await carouselDraft(t);
    expect(draft?.body).toBe("The Instagram caption.");
    expect(draft?.threadsText).toBe("Words for Threads.");
    expect(model.bodies.join("\n")).toContain("threadsText");
  });

  it("stores an empty Threads text (so it still goes to Threads) when the model sent none", async () => {
    fakeModel(reply());
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3, targets: ["threads"] } } });
    expect((await carouselDraft(t))?.threadsText).toBe("");
  });

  it("follows the saved default for the carousel, and a run that says Instagram only overrides it", async () => {
    const model = fakeModel(reply({ threadsText: "From the default." }));
    const { t, topic } = await seeded();
    const { voice } = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { targets: ["instagram", "threads"] } } } } });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3 } } });
    expect((await carouselDraft(t))?.threadsText).toBe("From the default.");

    model.bodies.length = 0;
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3, targets: ["instagram"] } } });
    expect((await carouselDraft(t))?.threadsText).toBeUndefined();
    expect(model.bodies.join("\n")).not.toContain("threadsText");
  });

  it("writes no Threads text by default", async () => {
    const model = fakeModel(reply({ threadsText: "Should be ignored." }));
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3 } } });
    expect((await carouselDraft(t))?.threadsText).toBeUndefined();
    expect(model.bodies.join("\n")).not.toContain("threadsText");
  });

  it("refuses an unknown platform in the saved settings", async () => {
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

describe("writing just the Threads text", () => {
  async function storedCarousel(t: TestConvex, topic: Awaited<ReturnType<typeof insertTopic>>, extra: Record<string, unknown> = {}) {
    return await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        topicId: topic,
        platform: "instagram",
        body: "The Instagram caption.",
        templateKey: "carousel-slides",
        templateVersion: 1,
        format: "carousel",
        slides: [
          { layout: "cover", tone: "cream", headline: "Price on positioning", sub: "Not on math." },
          { layout: "cards", tone: "ink", headline: "The receipt", cards: [{ big: "10-20%", text: "Share of value.", tone: "cream" }] },
        ],
        mediaAssetIds: [await ctx.db.insert("mediaAssets", { storageId: "external:a", publicUrl: "https://x.test/a.png", mimeType: "image/png", createdAt: Date.now() })],
        charCount: 22,
        constraintOk: true,
        createdAt: Date.now(),
        ...extra,
      })
    );
  }

  it("writes the text from the slides and the caption, saves it on the carousel, and leaves the slides and images alone", async () => {
    const model = fakeModel('"Most SaaS is underpriced. Price on the value, not the cost."');
    const { t, topic } = await seeded();
    const id = await storedCarousel(t, topic);
    const before = await t.run((ctx) => ctx.db.get(id));
    const out = await t.action(api.drafting.writeThreadsText, { draftId: id });
    expect(out).toBe("Most SaaS is underpriced. Price on the value, not the cost.");
    const after = await t.run((ctx) => ctx.db.get(id));
    expect(after?.threadsText).toBe(out);
    expect(after?.slides).toEqual(before?.slides);
    expect(after?.mediaAssetIds).toEqual(before?.mediaAssetIds);
    expect(after?.body).toBe("The Instagram caption.");
    const sent = model.bodies.join("\n");
    expect(sent).toContain("Price on positioning");
    expect(sent).toContain("10-20% Share of value.");
    expect(sent).toContain("The Instagram caption.");
    expect(sent).toContain("500 characters");
  });

  it("cuts a reply that is too long to 500 characters, and refuses one with nothing in it", async () => {
    const { t, topic } = await seeded();
    const id = await storedCarousel(t, topic);
    fakeModel("A sentence that goes on. ".repeat(60));
    const long = await t.action(api.drafting.writeThreadsText, { draftId: id });
    expect(long.length).toBeLessThanOrEqual(500);
    fakeModel("   ");
    await expect(t.action(api.drafting.writeThreadsText, { draftId: id })).rejects.toThrow(/BAD_THREADS_TEXT/);
  });

  it("refuses a draft that is not a carousel or is gone", async () => {
    fakeModel("x");
    const { t, topic } = await seeded();
    const caption = await t.run(async (ctx) =>
      ctx.db.insert("drafts", { topicId: topic, platform: "instagram", body: "c", templateKey: "ig-caption-beats", templateVersion: 1, charCount: 1, constraintOk: true, createdAt: Date.now() })
    );
    await expect(t.action(api.drafting.writeThreadsText, { draftId: caption })).rejects.toThrow(/NOT_A_CAROUSEL/);
    const id = await storedCarousel(t, topic);
    await t.run((ctx) => ctx.db.delete(id));
    await expect(t.action(api.drafting.writeThreadsText, { draftId: id })).rejects.toThrow(/DRAFT_NOT_FOUND/);
  });

  it("writes from the caption alone for a carousel made of the founder's own images", async () => {
    const model = fakeModel("Words for Threads.");
    const { t, topic } = await seeded();
    const id = await storedCarousel(t, topic, { slideSource: "uploaded" });
    await t.action(api.drafting.writeThreadsText, { draftId: id });
    const sent = model.bodies.join("\n");
    expect(sent).toContain("founder's own images");
    expect(sent).not.toContain("Price on positioning");
  });
});
