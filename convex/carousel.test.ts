import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { carouselInstructions, clampSlideCount, parseCarousel } from "./lib/carouselDraft";
import { headlineSize, pageLabel, splitHeadline, validateSlide, type Slide } from "./lib/carouselSlides";
import { insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const slide = (over: Partial<Slide> = {}): Slide => ({ layout: "cards", tone: "cream", headline: "A headline", ...over });

describe("slide limits", () => {
  it("accepts every layout and refuses text past the limits with a readable message", () => {
    expect(validateSlide(slide({ layout: "cover", sub: "One idea." })).ok).toBe(true);
    expect(validateSlide(slide({ cards: [{ text: "Hi", tone: "ink", big: "60d", label: "TOKEN LIFE" }] })).ok).toBe(true);
    expect(validateSlide(slide({ layout: "list", items: [{ text: "One" }, { label: "Two", text: "Two" }] })).ok).toBe(true);
    expect(validateSlide(slide({ layout: "close", pills: ["Follow", "Save", "Share"] })).ok).toBe(true);
    expect(validateSlide(slide({ layout: "statement", tag: "Build in public", sub: "I have never reached this state." })).ok).toBe(true);
    expect(validateSlide(slide({ layout: "statement", tag: "x".repeat(31) })).ok).toBe(false);
    const bad = validateSlide(slide({ headline: "x".repeat(91) }));
    expect(bad.ok).toBe(false);
    expect(validateSlide({ ...slide(), tone: "purple" }).ok).toBe(false);
    expect(validateSlide(slide({ cards: Array.from({ length: 4 }, () => ({ text: "x", tone: "ink" as const })) })).ok).toBe(false);
  });

  it("keeps a headline's line breaks and tidies spaces", () => {
    const ok = validateSlide(slide({ headline: "Queue it.  \n  Walk away." }));
    expect(ok.ok && ok.slide.headline).toBe("Queue it.\nWalk away.");
  });
});

describe("splitHeadline", () => {
  const flat = (h: string, a?: string) => splitHeadline(h, a).map((l) => l.map((w) => `${w.text}${w.accent ? "*" : ""}`));
  it("marks the accent words, ignoring case and punctuation, first match only", () => {
    expect(flat("Keep them alive.", "alive")).toEqual([["Keep", "them", "alive.*"]]);
    expect(flat("It is not a reel, not a thread", "not")).toEqual([["It", "is", "not*", "a", "reel,", "not", "a", "thread"]]);
    expect(flat("A Threads post", "threads post")).toEqual([["A", "Threads*", "post*"]]);
    expect(flat("No accent here")).toEqual([["No", "accent", "here"]]);
  });

  it("splits a hyphenated word so either half can carry the accent, and joins them without a gap", () => {
    const lines = splitHeadline("Stop cross-posting.", "posting.");
    expect(lines[0].map((w) => [w.text, w.accent, w.joined])).toEqual([
      ["Stop", false, false],
      ["cross-", false, true],
      ["posting.", true, false],
    ]);
  });

  it("colours several parts of a headline when the accent lists them with |", () => {
    expect(flat("Docs: 100 posts. Lower down: 50.", "100|50.")).toEqual([["Docs:", "100*", "posts.", "Lower", "down:", "50.*"]]);
    expect(flat("It is 100 and 100", "100")).toEqual([["It", "is", "100*", "and", "100"]]);
  });

  it("starts a new line at a line break", () => {
    expect(flat("Queue it.\nWalk away.", "Walk away.")).toEqual([["Queue", "it."], ["Walk*", "away.*"]]);
  });
});

describe("headline size and page label", () => {
  it("steps the size down as the headline grows, and the cover is bigger", () => {
    expect(headlineSize("cover", "Stop cross-posting.")).toBeGreaterThan(headlineSize("cards", "Stop cross-posting."));
    expect(headlineSize("cards", "x".repeat(70))).toBeLessThan(headlineSize("cards", "x".repeat(20)));
    expect(headlineSize("statement", "x".repeat(60))).toBe(124);
    expect(headlineSize("statement", "x".repeat(85))).toBeLessThan(124);
  });
  it("pads the page label", () => {
    expect(pageLabel(0, 6)).toBe("01/06");
    expect(pageLabel(9, 10)).toBe("10/10");
  });
});

const GOOD_REPLY = JSON.stringify({
  caption: "The caption.\n\n#one #two #three #four #five #six #seven",
  slides: [
    { layout: "cards", tone: "coral", kicker: "TIP", headline: "Stop cross-posting.", accent: "posting.", sub: "One idea." },
    { layout: "cards", tone: "ink", headline: "Two drafts.", cards: [{ label: "THREADS", big: "500", text: "characters.", tone: "cream" }] },
    { layout: "list", tone: "blue", headline: "Steps", items: [{ text: "One" }, { text: "Two" }] },
    { layout: "cover", tone: "yellow", headline: "End.", sub: "Follow.", pills: ["Follow", "Save", "Share"] },
  ],
});

describe("parseCarousel", () => {
  it("reads a reply in a code fence, forces the cover first and turns a closing cover into a close", () => {
    const out = parseCarousel("Here you go:\n```json\n" + GOOD_REPLY + "\n```", 4);
    expect(out?.slides).toHaveLength(4);
    expect(out?.slides.map((s) => s.layout)).toEqual(["cover", "cards", "list", "close"]);
    expect(out?.caption).toContain("The caption.");
  });

  it("cuts overlong text instead of refusing, fills a missing colour, and keeps at most the asked count", () => {
    const reply = JSON.stringify({
      caption: "c",
      slides: Array.from({ length: 8 }, (_, i) => ({ layout: "cards", headline: "H".repeat(200) + i, cards: [{ text: "T".repeat(400), tone: "nope" }] })),
    });
    const out = parseCarousel(reply, 5);
    expect(out?.slides).toHaveLength(5);
    expect(out?.slides[1].headline.length).toBeLessThanOrEqual(90);
    expect(out?.slides[1].cards?.[0].text.length).toBeLessThanOrEqual(160);
    expect(out?.slides.every((s) => ["coral", "cream", "ink", "pink", "yellow", "blue"].includes(s.tone))).toBe(true);
  });

  it("one slide is a single statement image with a tag, whatever layout the model named", () => {
    const reply = JSON.stringify({ caption: "The caption.", slides: [{ layout: "cards", tone: "yellow", kicker: "FUN FACT", headline: "A 10-slide carousel counts as one post.", accent: "10-slide", sub: "Ten slides, one tick.", tag: "Build in public" }] });
    const out = parseCarousel(reply, 1);
    expect(out?.slides).toHaveLength(1);
    expect(out?.slides[0]).toMatchObject({ layout: "statement", tag: "Build in public", accent: "10-slide" });
    // A tag is only kept on a statement slide.
    const many = parseCarousel(JSON.stringify({ caption: "c", slides: JSON.parse(GOOD_REPLY).slides.map((x: object) => ({ ...x, tag: "nope" })) }), 4);
    expect(many?.slides.every((x) => x.tag === undefined || x.layout === "statement")).toBe(true);
    expect(many?.slides.some((x) => x.layout === "statement")).toBe(false);
  });

  it("takes Markdown emphasis marks off slide text and gives a close slide its usual asks", () => {
    const reply = JSON.stringify({
      caption: "c",
      slides: [
        { layout: "cover", tone: "ink", headline: "**Bold** start", sub: "*Schedule renewal before day 60.*" },
        { layout: "cards", tone: "cream", headline: "Mid", cards: [{ text: "_Quiet_ card", tone: "ink" }] },
        { layout: "list", tone: "blue", headline: "List", items: [{ text: "One" }] },
        { layout: "close", tone: "coral", headline: "End", pills: ["Follow"] },
      ],
    });
    const out = parseCarousel(reply, 4);
    expect(out?.slides[0].headline).toBe("Bold start");
    expect(out?.slides[0].sub).toBe("Schedule renewal before day 60.");
    expect(out?.slides[1].cards?.[0].text).toBe("Quiet card");
    expect(out?.slides[3].pills).toEqual(["Follow", "Save", "Share"]);
    // Real asterisks and underscores inside a word are left alone.
    expect(parseCarousel(JSON.stringify({ caption: "c", slides: [{ headline: "snake_case and 2*3" }] }), 1)?.slides[0].headline).toBe("snake_case and 2*3");
  });

  it("is null for no JSON, no caption, or no usable slide", () => {
    expect(parseCarousel("sorry", 6)).toBeNull();
    expect(parseCarousel(JSON.stringify({ slides: [] }), 6)).toBeNull();
    expect(parseCarousel(JSON.stringify({ caption: "c", slides: [] }), 6)).toBeNull();
    expect(parseCarousel(JSON.stringify({ caption: "c", slides: [{ headline: "" }] }), 1)).toBeNull();
    expect(parseCarousel(JSON.stringify({ slides: JSON.parse(GOOD_REPLY).slides }), 4)).toBeNull();
    // Fewer slides than asked are kept, not refused.
    expect(parseCarousel(JSON.stringify({ caption: "c", slides: JSON.parse(GOOD_REPLY).slides.slice(0, 2) }), 6)?.slides).toHaveLength(2);
  });

  it("never keeps a bare-headline slide: it uses the other content, else the italic line, else leaves the slide out", () => {
    const reply = JSON.stringify({
      caption: "c",
      slides: [
        { layout: "cover", tone: "ink", headline: "Cover" },
        { layout: "cards", tone: "cream", headline: "Cards with items", items: [{ text: "One" }, { text: "Two" }] },
        { layout: "cards", tone: "yellow", headline: "Cards with only an aside", sub: "The only thing said here." },
        { layout: "list", tone: "blue", headline: "List with cards", cards: [{ text: "A card", tone: "ink" }] },
        { layout: "cards", tone: "pink", headline: "Nothing at all" },
        { layout: "close", tone: "coral", headline: "End" },
      ],
    });
    const out = parseCarousel(reply, 6);
    expect(out?.slides.map((s) => s.headline)).toEqual(["Cover", "Cards with items", "Cards with only an aside", "List with cards", "End"]);
    expect(out?.slides[1]).toMatchObject({ layout: "list" });
    expect(out?.slides[2]).toMatchObject({ layout: "cards", cards: [{ text: "The only thing said here." }] });
    expect(out?.slides[2].sub).toBeUndefined();
    expect(out?.slides[3]).toMatchObject({ layout: "cards" });
    // Every slide that is not a cover or close carries what its layout draws.
    for (const s of out?.slides ?? []) {
      if (s.layout === "cards") expect(s.cards?.length).toBeGreaterThan(0);
      if (s.layout === "list") expect(s.items?.length).toBeGreaterThan(0);
    }
  });

  it("cuts text that is over its limit at a whole sentence or word, never mid-word", () => {
    const first = "Each community suits a different goal, so match the community to what you are trying to do first.";
    const sentence = `${first} Then join one, read for a week, and ask one clear question once you know the place.`;
    expect(sentence.length).toBeGreaterThan(160);
    const out = parseCarousel(
      JSON.stringify({ caption: "c", slides: [{ layout: "cover", headline: "H" }, { layout: "cards", headline: "Mid", cards: [{ text: sentence, tone: "ink" }] }] }),
      2
    );
    // Over the limit: kept up to the end of the last whole sentence that fits.
    expect(out?.slides[1].cards?.[0].text).toBe(first);
    const long = "Pick the community that fits what you are building rather than the biggest list, then spend a week reading before you post anything yourself, and ask one clear question".repeat(1);
    const cut = parseCarousel(JSON.stringify({ caption: "c", slides: [{ layout: "cover", headline: "H" }, { layout: "cards", headline: "Mid", cards: [{ text: long, tone: "ink" }] }] }), 2)?.slides[1].cards?.[0].text ?? "";
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(long.startsWith(cut)).toBe(true);
    expect(/\s$|[,;:\-]$/.test(cut)).toBe(false);
    // Cut on a word boundary: the next character in the original is a space.
    expect(long[cut.length]).toBe(" ");
  });

  it("clamps the slide count and puts the count and style in the instructions", () => {
    expect(clampSlideCount(undefined)).toBe(6);
    expect(clampSlideCount(0)).toBe(1);
    expect(clampSlideCount(1)).toBe(1);
    expect(clampSlideCount(2)).toBe(2);
    expect(clampSlideCount(30)).toBe(10);
    const text = carouselInstructions({ count: 7, style: "Warm paper, big numbers." });
    expect(text).toContain("exactly 7 slides");
    expect(text).toContain("Warm paper, big numbers.");
    expect(text).toContain("never invent one");
    expect(text).toContain("well established");
    expect(text).toContain("show both ends");
    expect(text).toContain("Name the source once");
    expect(text).toContain("never put your own wording or points in a source");
    expect(text).toContain("a first-person line is allowed only when the notes say it");
    const one = carouselInstructions({ count: 1 });
    expect(one).toContain("exactly 1 slide");
    expect(one).toContain("statement");
    expect(one).toContain("a first-person line is allowed only when the notes say it");
    // The founder's request is added last, and a run with no frame says the model plans the order.
    const asked = carouselInstructions({ count: 5, brief: "Explainer, big numbers, only yellow and ink.", arc: false });
    expect(asked).toContain("Explainer, big numbers, only yellow and ink.");
    expect(asked).toContain("use only those slide tones");
    expect(asked).toContain("There is no story frame");
    expect(asked.indexOf("only yellow and ink")).toBeGreaterThan(asked.indexOf("There is no story frame"));
    expect(asked).toContain("hard");
    expect(asked).toContain("Never send a slide that is only a headline");
    expect(carouselInstructions({ count: 5 })).not.toContain("There is no story frame");
  });
});

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
  const topic = await insertTopic(t, "A topic");
  return { t, topic };
}

const carouselDrafts = (t: TestConvex) =>
  t.run(async (ctx) => (await ctx.db.query("drafts").collect()).filter((d) => d.templateKey === "carousel-slides"));

describe("generating a carousel", () => {
  it("stores the caption as the body and the slides on the draft, with the frame, count and style in the request", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    const out = await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["instagram-carousel"],
      setup: { carousel: { frameKey: "ig-carousel", count: 4 } },
    });
    expect(out.drafts.map((d) => d.format)).toEqual(["instagram-carousel"]);
    const [draft] = await carouselDrafts(t);
    expect(draft.platform).toBe("instagram");
    expect(draft.format).toBe("carousel");
    expect(draft.frameKey).toBe("ig-carousel");
    expect(draft.slides).toHaveLength(4);
    expect(draft.slides?.[0].layout).toBe("cover");
    expect(draft.mediaAssetIds).toBeUndefined();
    // The founder's hashtag cap (5) is applied to the caption.
    expect((draft.body.match(/#\w+/g) ?? []).length).toBeLessThanOrEqual(5);
    const sent = model.bodies.join("\n");
    expect(sent).toContain("exactly 4 slides");
    expect(sent).toContain("Short bold headlines, one idea per slide");
    expect(sent).toContain("Story frame");
    // The no-invented-experience rule reaches the model twice: in the system prompt and after the template.
    expect(sent).toContain("Never invent what the founder did, tried, felt, said or noticed");
    expect(sent).toContain("a first-person line is allowed only when the notes say it");
    // A carousel may add well-established context, so the strict "only what is in the notes" rule is not sent with it.
    expect(sent).toContain("show both ends");
    expect(sent).not.toContain("Prefer writing without a number at all");
  });

  it("sends the founder's own description with no story frame, and stores a carousel without a frame", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["instagram-carousel"],
      setup: { carousel: { noFrame: true, brief: "  An explainer: big numbers, only yellow and ink.  ", count: 4 } },
    });
    const [draft] = await carouselDrafts(t);
    expect(draft.frameKey).toBeUndefined();
    expect(draft.slides).toHaveLength(4);
    const sent = model.bodies.join("\n");
    expect(sent).toContain("An explainer: big numbers, only yellow and ink.");
    expect(sent).toContain("There is no story frame");
    expect(sent).not.toContain("The beats above are the arc of the story");
    expect(sent).not.toContain("Short bold headlines, one idea per slide");
  });

  it("sends the description along with a chosen frame, and refuses one that is too long before calling the model", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["instagram-carousel"],
      setup: { carousel: { frameKey: "ig-carousel", brief: "Calm, lots of white space." } },
    });
    const sent = model.bodies.join("\n");
    expect(sent).toContain("Calm, lots of white space.");
    expect(sent).toContain("The beats above are the arc of the story");
    const before = model.bodies.length;
    await expect(
      t.action(api.drafting.generate, {
        topicId: topic,
        formats: ["instagram-carousel"],
        setup: { carousel: { brief: "x".repeat(801) } },
      })
    ).rejects.toThrow(/BAD_BRIEF/);
    expect(model.bodies).toHaveLength(before);
  });

  it("keeps the strict facts rule for a thread, which does not get the carousel's looser one", async () => {
    const model = fakeModel("First post.\n---\nSecond post.");
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"] });
    const sent = model.bodies.join("\n");
    expect(sent).toContain("Prefer writing without a number at all");
    expect(sent).toContain("Never invent what the founder did, tried, felt, said or noticed");
    expect(sent).not.toContain("show both ends");
  });

  it("writes a single statement slide when the count is 1", async () => {
    const reply = JSON.stringify({ caption: "A caption.", slides: [{ layout: "statement", tone: "blue", kicker: "DOCS, CHECKED", headline: "Docs say 100. The page says 50.", accent: "100|50.", sub: "I choose the higher one.", tag: "Build in public" }] });
    const model = fakeModel(reply);
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 1 } } });
    const [draft] = await carouselDrafts(t);
    expect(draft.slides).toHaveLength(1);
    expect(draft.slides?.[0]).toMatchObject({ layout: "statement", tag: "Build in public" });
    expect(model.bodies.join("\n")).toContain("exactly 1 slide");
  });

  it("is chosen from the saved defaults when this run says nothing, and refuses a bad count or frame", async () => {
    fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    const { voice } = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, { patch: { voice: { ...voice, formatDefaults: { carousel: { frameKey: "receipt", count: 4 } } } } });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"] });
    expect((await carouselDrafts(t))[0].frameKey).toBe("receipt");
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 12 } } })).rejects.toThrow(/BAD_SLIDE_COUNT/);
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 0 } } })).rejects.toThrow(/BAD_SLIDE_COUNT/);
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { frameKey: "hot-take" } } })).rejects.toThrow(/FRAME_DOESNT_FIT/);
  });

  it("refuses a reply with no usable carousel, and a regenerated carousel does not keep the old images", async () => {
    fakeModel("no json at all");
    const { t, topic } = await seeded();
    await expect(t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"] })).rejects.toThrow(/BAD_CAROUSEL/);

    fakeModel(GOOD_REPLY);
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"] });
    const [first] = await carouselDrafts(t);
    const assets = await pngAssets(t, 4);
    await t.mutation(api.drafts.attachCarouselMedia, { id: first._id, mediaAssetIds: assets });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"] });
    const after = await carouselDrafts(t);
    expect(after).toHaveLength(1);
    expect(after[0].mediaAssetIds).toBeUndefined();
    expect(after[0].mediaAssetId).toBeUndefined();
  });
});

async function pngAssets(t: TestConvex, n: number, mimeType = "image/png"): Promise<Id<"mediaAssets">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"mediaAssets">[] = [];
    for (let i = 0; i < n; i += 1) {
      ids.push(await ctx.db.insert("mediaAssets", { storageId: `external:${i}`, publicUrl: `https://files.example/${i}.png`, mimeType, source: "external", createdAt: Date.now() }));
    }
    return ids;
  });
}

async function storedCarousel(t: TestConvex, topic: Id<"topics">, count = 4): Promise<Id<"drafts">> {
  const slides = Array.from({ length: count }, (_, i) => slide({ layout: i === 0 ? "cover" : "cards", headline: `Slide ${i + 1}` }));
  return await t.run(async (ctx) =>
    ctx.db.insert("drafts", { topicId: topic, platform: "instagram", body: "Caption", templateKey: "carousel-slides", templateVersion: 1, format: "carousel", slides, charCount: 7, constraintOk: true, createdAt: Date.now() })
  );
}

describe("editing and attaching a carousel", () => {
  it("updateSlides saves valid slides, detaches stale images, and refuses bad counts and text", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const id = await storedCarousel(t, topic);
    const assets = await pngAssets(t, 4);
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: assets });
    expect((await t.run((ctx) => ctx.db.get(id)))?.mediaAssetId).toBe(assets[0]);

    const next = [slide({ layout: "cover", headline: "New cover" }), slide({ headline: "Two" }), slide({ headline: "Three" })];
    await t.mutation(api.drafts.updateSlides, { id, slides: next });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.slides?.map((s) => s.headline)).toEqual(["New cover", "Two", "Three"]);
    expect(row?.mediaAssetIds).toBeUndefined();
    expect(row?.mediaAssetId).toBeUndefined();

    await expect(t.mutation(api.drafts.updateSlides, { id, slides: [] })).rejects.toThrow(/BAD_SLIDE_COUNT/);
    await expect(t.mutation(api.drafts.updateSlides, { id, slides: Array.from({ length: 11 }, () => slide()) })).rejects.toThrow(/BAD_SLIDE_COUNT/);
    // A single statement slide is allowed.
    await t.mutation(api.drafts.updateSlides, { id, slides: [slide({ layout: "statement", tag: "Build in public" })] });
    expect((await t.run((ctx) => ctx.db.get(id)))?.slides).toHaveLength(1);
    await expect(t.mutation(api.drafts.updateSlides, { id, slides: [slide(), slide({ headline: "x".repeat(95) })] })).rejects.toThrow(/INVALID_SLIDE: Slide 2/);
  });

  it("attachCarouselMedia needs one PNG or JPEG per slide, in order, no repeats; the cover becomes the draft's image", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const id = await storedCarousel(t, topic);
    const assets = await pngAssets(t, 4);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: assets.slice(0, 3) })).rejects.toThrow(/SLIDE_IMAGE_COUNT/);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: [assets[0], assets[0], assets[1], assets[2]] })).rejects.toThrow(/SLIDE_IMAGE_DUPLICATE/);
    const gifs = await pngAssets(t, 4, "image/gif");
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: gifs })).rejects.toThrow(/SLIDE_IMAGE_TYPE/);
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: assets });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.mediaAssetIds).toEqual(assets);
    expect(row?.mediaAssetId).toBe(assets[0]);
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: [] });
    expect((await t.run((ctx) => ctx.db.get(id)))?.mediaAssetIds).toBeUndefined();
  });

  it("only a carousel has slides, and a carousel that already has a post cannot be changed", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const plain = await t.run(async (ctx) =>
      ctx.db.insert("drafts", { topicId: topic, platform: "instagram", body: "x", templateKey: "ig-caption-beats", templateVersion: 1, charCount: 1, constraintOk: true, createdAt: Date.now() })
    );
    await expect(t.mutation(api.drafts.updateSlides, { id: plain, slides: [slide(), slide()] })).rejects.toThrow(/NOT_A_CAROUSEL/);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id: plain, mediaAssetIds: [] })).rejects.toThrow(/NOT_A_CAROUSEL/);

    const id = await storedCarousel(t, topic);
    await insertSlot(t, id, Date.now() + 3_600_000, { platform: "instagram" });
    await expect(t.mutation(api.drafts.updateSlides, { id, slides: [slide(), slide()] })).rejects.toThrow(/CAROUSEL_QUEUED/);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: await pngAssets(t, 4) })).rejects.toThrow(/CAROUSEL_QUEUED/);
  });

  it("counts every slide image as in use, so a slide image that is not the cover cannot be deleted", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const id = await storedCarousel(t, topic);
    const assets = await pngAssets(t, 4);
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: assets });
    // The last slide image is not the cover, and is still protected from deletion.
    await expect(t.mutation(api.media.remove, { id: assets[3] })).rejects.toThrow(/IN_USE/);
    const listed = await t.query(api.media.list, {});
    expect(listed.find((a) => a._id === assets[3])?.usedBy).toBe(1);
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: [] });
    await t.mutation(api.media.remove, { id: assets[3] });
  });

  it("the cleanup after publishing removes every slide image of a published carousel, not just the cover", async () => {
    const DAY = 86_400_000;
    const NOW = Date.UTC(2026, 9, 5, 12, 0);
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("appSettings", { ...DEFAULT_SETTINGS, media: { igCrop: "4:5", cleanupAfterDays: 7 } });
    });
    const topic = await insertTopic(t);
    const id = await storedCarousel(t, topic, 2);
    const assets = await t.run(async (ctx) => {
      const ids: Id<"mediaAssets">[] = [];
      for (let i = 0; i < 2; i += 1) {
        const storageId = await ctx.storage.store(new Blob(["pixels"], { type: "image/png" }));
        ids.push(await ctx.db.insert("mediaAssets", { storageId, publicUrl: "https://files.example/" + i, mimeType: "image/png", source: "upload", verifiedAt: NOW, createdAt: NOW - 30 * DAY }));
      }
      return ids;
    });
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: assets });
    const slotId = await insertSlot(t, id, NOW - 10 * DAY, { platform: "instagram", status: "published" });
    await t.run(async (ctx) => ctx.db.patch(slotId, { publishedAt: NOW - 10 * DAY }));
    const out = await t.mutation(internal.media.cleanupPublished, { now: NOW });
    expect(out).toEqual({ status: "done", deleted: 2 });
    const rows = await t.run(async (ctx) => Promise.all(assets.map((a) => ctx.db.get(a))));
    expect(rows.every((r) => r?.fileDeletedAt !== undefined)).toBe(true);
  });
});

describe("writing a carousel with a look", () => {
  const plan = [
    { layout: "cover" as const, tone: "pink" as const },
    { layout: "cards" as const, tone: "yellow" as const },
    { layout: "list" as const, tone: "blue" as const },
    { layout: "close" as const, tone: "ink" as const },
  ];

  it("tells the model the plan, fitted to the slide count, and uses the plan's colours whatever the model chose", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    const { key } = await t.mutation(api.looks.save, { name: "Pastel", plan });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 4 } } });
    const [draft] = await carouselDrafts(t);
    // GOOD_REPLY colours the slides coral, ink, blue, yellow: the plan wins.
    expect(draft.slides?.map((s) => s.tone)).toEqual(["pink", "yellow", "blue", "ink"]);
    expect(draft.lookKey).toBe(key);
    const sent = model.bodies.join("\n");
    expect(sent).toContain("1 cover in pink; 2 cards in yellow; 3 list in blue; 4 close in ink");
    expect(sent).toContain("What the app can draw");
    expect((await t.query(api.looks.list, {}))[0].usedCount).toBe(1);

    // A different slide count stretches the plan: the middle slides cycle.
    const model6 = fakeModel(JSON.stringify({ caption: "c", slides: JSON.parse(GOOD_REPLY).slides }));
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 6 } } });
    expect(model6.bodies.join("\n")).toContain("1 cover in pink; 2 cards in yellow; 3 list in blue; 4 cards in yellow; 5 list in blue; 6 close in ink");
  });

  it("sends a design document as the founder wrote it, and the founder's own description still comes after it", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    const { key } = await t.mutation(api.looks.save, { name: "Doc", design: "# Calm\n- White space\n- One idea per slide" });
    await t.action(api.drafting.generate, {
      topicId: topic,
      formats: ["instagram-carousel"],
      setup: { carousel: { lookKey: key, brief: "Make it punchier.", count: 4 } },
    });
    const sent = model.bodies.join("\n");
    expect(sent).toContain("design guide");
    expect(sent).toContain("# Calm");
    expect(sent).toContain("One idea per slide");
    expect(sent.indexOf("Make it punchier.")).toBeGreaterThan(sent.indexOf("One idea per slide"));
    // No plan, so the model's own colours are kept.
    const [draft] = await carouselDrafts(t);
    expect(draft.slides?.map((s) => s.tone)).toEqual(["coral", "ink", "blue", "yellow"]);
  });

  /** The model stub plus an image host: the AI SDK downloads a reference image itself, then sends it inline. */
  function fakeModelWithImages(content: string) {
    const model = fakeModel(content);
    const completion = (globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>).bind(globalThis);
    const fetched: string[] = [];
    const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.startsWith("https://files.example/")) {
          fetched.push(u);
          return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
        }
        return completion(u, init);
      })
    );
    return { ...model, fetched };
  }

  it("sends reference images to the model as images, with the instruction not to copy their words", async () => {
    const model = fakeModelWithImages(GOOD_REPLY);
    const { t, topic } = await seeded();
    const imgs = await pngAssets(t, 2);
    const { key } = await t.mutation(api.looks.save, { name: "Refs", referenceIds: imgs });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 4 } } });
    expect(model.fetched.sort()).toEqual(["https://files.example/0.png", "https://files.example/1.png"]);
    const sent = model.bodies.join("\n");
    expect(sent).toContain("image_url");
    expect(sent).toContain("data:image/png;base64");
    expect(sent).toContain("Reference images are attached");
    expect(sent).toContain("Never copy their words");
    // A reference whose file was removed from storage is left out rather than sent.
    await t.run(async (ctx) => ctx.db.patch(imgs[1], { fileDeletedAt: Date.now() }));
    const again = fakeModelWithImages(GOOD_REPLY);
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 4 } } });
    expect(again.fetched).toEqual(["https://files.example/0.png"]);
  });

  it("reads a stored reference image from storage and sends its bytes inline, and refuses one over 5 MB", async () => {
    const model = fakeModelWithImages(GOOD_REPLY);
    const { t, topic } = await seeded();
    const stored = async (bytes: number) =>
      await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(7)], { type: "image/png" }));
        return await ctx.db.insert("mediaAssets", { storageId, publicUrl: "https://files.example/stored.png", mimeType: "image/png", source: "upload", filename: "big.png", createdAt: Date.now() });
      });
    const small = await stored(2048);
    const { key } = await t.mutation(api.looks.save, { name: "Stored", referenceIds: [small] });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 4 } } });
    // The bytes travel inside the request; nothing was downloaded from the public URL.
    expect(model.fetched).toEqual([]);
    expect(model.bodies.join("\n")).toContain("data:image/png;base64");
    const big = await stored(5 * 1024 * 1024 + 1);
    const { key: bigKey } = await t.mutation(api.looks.save, { name: "Big", referenceIds: [big] });
    const before = model.bodies.length;
    await expect(
      t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: bigKey, count: 4 } } })
    ).rejects.toThrow(/REFERENCE_TOO_BIG: Reference image 1 \(big\.png\) is over 5 MB/);
    expect(model.bodies).toHaveLength(before);
  });

  it("refuses a look that is gone before any model call, and a run without a look sends none of it", async () => {
    const model = fakeModel(GOOD_REPLY);
    const { t, topic } = await seeded();
    await expect(
      t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: "no-such-look" } } })
    ).rejects.toThrow(/LOOK_NOT_FOUND/);
    expect(model.bodies).toHaveLength(0);
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 4 } } });
    const sent = model.bodies.join("\n");
    expect(sent).not.toContain("What the app can draw");
    expect(sent).not.toContain("saved slide plan");
    expect((await carouselDrafts(t))[0].lookKey).toBeUndefined();
  });
});

describe("writing a carousel in a theme", () => {
  const withNotes = JSON.stringify({
    caption: "c",
    slides: [
      { layout: "cover", tone: "cream", headline: "Cover" },
      { layout: "cards", tone: "ink", kicker: "THE RECEIPT", headline: "A receipt", cards: [{ label: "COST", big: "40", text: "Under forty.", tone: "ink" }], note: "under 40 rupees, no really, about as cheap as a snack" },
      { layout: "close", tone: "coral", headline: "End", pills: ["Follow", "Save", "Share"] },
    ],
  });

  it("tells the model what the Kraft zine theme draws, keeps the notes (cut to 40 characters) and stores the theme", async () => {
    const model = fakeModel(withNotes);
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { theme: "kraft-zine", count: 3 } } });
    const [draft] = await carouselDrafts(t);
    expect(draft.theme).toBe("kraft-zine");
    const sent = model.bodies.join("\n");
    expect(sent).toContain("the Kraft zine theme");
    expect(sent).toContain("torn-tape");
    expect(sent).toContain("terminal window");
    expect(sent).toContain("hand-written red aside");
    const note = draft.slides?.[1].note ?? "";
    expect(note.length).toBeGreaterThan(0);
    expect(note.length).toBeLessThanOrEqual(40);
    expect("under 40 rupees, no really, about as cheap as a snack".startsWith(note)).toBe(true);
  });

  it("adds nothing for Solo Queue, and stores no theme for it", async () => {
    const model = fakeModel(withNotes);
    const { t, topic } = await seeded();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { count: 3 } } });
    expect(model.bodies.join("\n")).not.toContain("Kraft zine");
    expect((await carouselDrafts(t))[0].theme).toBeUndefined();
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { theme: "solo-queue", count: 3 } } });
    expect((await carouselDrafts(t))[0].theme).toBeUndefined();
  });

  it("takes the look's theme, which this run's own pick overrides", async () => {
    const model = fakeModel(withNotes);
    const { t, topic } = await seeded();
    const { key } = await t.mutation(api.looks.save, { name: "Zine", theme: "kraft-zine" });
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, count: 3 } } });
    expect((await carouselDrafts(t))[0].theme).toBe("kraft-zine");
    expect(model.bodies.join("\n")).toContain("the Kraft zine theme");
    await t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { lookKey: key, theme: "solo-queue", count: 3 } } });
    expect((await carouselDrafts(t))[0].theme).toBeUndefined();
  });

  it("refuses an unknown theme before any model call", async () => {
    const model = fakeModel(withNotes);
    const { t, topic } = await seeded();
    await expect(
      t.action(api.drafting.generate, { topicId: topic, formats: ["instagram-carousel"], setup: { carousel: { theme: "neon" } } })
    ).rejects.toThrow(/THEME_NOT_FOUND/);
    expect(model.bodies).toHaveLength(0);
  });
});
