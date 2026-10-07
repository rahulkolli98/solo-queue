import { describe, expect, it, vi } from "vitest";
import { MAX_SLIDES, MIN_SLIDES, SLIDE_TONES, type Slide } from "../../convex/lib/carouselSlides";
import {
  DEFAULT_PILLS,
  MAX_CARDS,
  MAX_ITEMS,
  MAX_PILLS,
  SlideDrawError,
  addCard,
  addItem,
  addPill,
  addSlide,
  captionCount,
  drawSlide,
  moveSlide,
  normalizeSlide,
  removeCard,
  removeSlide,
  setLayout,
  slideIssues,
  slideKey,
  slideProblems,
  slidesEqual,
  tidySlide,
  updateCard,
  updatePill,
  updateSlide,
} from "@/lib/carouselEditor";

const slide = (over: Partial<Slide> = {}): Slide => ({ layout: "cards", tone: "cream", headline: "A headline", ...over });
const deck = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => slide({ headline: `Slide ${i + 1}`, tone: SLIDE_TONES[i % SLIDE_TONES.length] }));
const headlines = (slides: Slide[]) => slides.map((s) => s.headline);

describe("updateSlide", () => {
  it("returns a new list and leaves the old one alone", () => {
    const before = deck(3);
    const after = updateSlide(before, 1, { headline: "Changed" });
    expect(headlines(after)).toEqual(["Slide 1", "Changed", "Slide 3"]);
    expect(headlines(before)).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
    expect(after[0]).toBe(before[0]);
  });

  it("removes a field patched to undefined and ignores an index that is not there", () => {
    const before = [slide({ kicker: "Hi" }), slide()];
    expect("kicker" in updateSlide(before, 0, { kicker: undefined })[0]).toBe(false);
    expect(updateSlide(before, 9, { headline: "x" })).toEqual(before);
  });
});

describe("moveSlide", () => {
  it("swaps with the neighbour", () => {
    expect(headlines(moveSlide(deck(3), 1, -1))).toEqual(["Slide 2", "Slide 1", "Slide 3"]);
    expect(headlines(moveSlide(deck(3), 1, 1))).toEqual(["Slide 1", "Slide 3", "Slide 2"]);
  });
  it("stays put at the ends", () => {
    expect(headlines(moveSlide(deck(3), 0, -1))).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
    expect(headlines(moveSlide(deck(3), 2, 1))).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
  });
  it("does not change the first slide's layout (the founder chooses the cover)", () => {
    const slides = [slide({ layout: "cover", headline: "Cover" }), slide({ headline: "Two" })];
    expect(moveSlide(slides, 0, 1)[1].layout).toBe("cover");
    expect(moveSlide(slides, 0, 1)[0].layout).toBe("cards");
  });
});

describe("removeSlide", () => {
  it("removes the slide", () => {
    expect(headlines(removeSlide(deck(4), 1))).toEqual(["Slide 1", "Slide 3", "Slide 4"]);
  });
  it(`never goes below ${MIN_SLIDES} slide(s)`, () => {
    expect(removeSlide(deck(MIN_SLIDES), 0)).toHaveLength(MIN_SLIDES);
    expect(removeSlide(deck(MIN_SLIDES + 1), 0)).toHaveLength(MIN_SLIDES);
  });
});

describe("addSlide", () => {
  it("adds a plain cards slide after the chosen one", () => {
    const after = addSlide(deck(3), 0);
    expect(after).toHaveLength(4);
    expect(after[1]).toMatchObject({ layout: "cards", headline: "New slide" });
    expect(after[1].cards).toBeUndefined();
    expect(headlines(after)).toEqual(["Slide 1", "New slide", "Slide 2", "Slide 3"]);
  });
  it("can go first (afterIndex -1) and last", () => {
    expect(addSlide(deck(2), -1)[0].headline).toBe("New slide");
    expect(addSlide(deck(2), 1)[2].headline).toBe("New slide");
  });
  it("gives the new slide a colour that differs from both neighbours", () => {
    for (let at = -1; at < 5; at += 1) {
      const slides = deck(6);
      const next = addSlide(slides, at);
      const i = at + 1;
      expect(next[i].tone).not.toBe(next[i - 1]?.tone);
      expect(next[i].tone).not.toBe(next[i + 1]?.tone);
    }
    const same = [slide({ tone: "coral" }), slide({ tone: "coral" })];
    expect(addSlide(same, 0)[1].tone).not.toBe("coral");
  });
  it("takes the next colour in the rotation", () => {
    const slides = [slide({ tone: "coral" }), slide({ tone: "ink" })];
    expect(addSlide(slides, 0)[1].tone).toBe("cream");
  });
  it(`never goes above ${MAX_SLIDES} slides`, () => {
    expect(addSlide(deck(MAX_SLIDES), 3)).toHaveLength(MAX_SLIDES);
  });
  it("makes a slide that passes the checks", () => {
    expect(slideProblems(addSlide(deck(2), 0))).toEqual([[], [], []]);
  });
});

describe("setLayout", () => {
  it("keeps the text and adds nothing to a cards slide", () => {
    const s = slide({ layout: "cover", kicker: "K", accent: "headline", sub: "italic" });
    expect(setLayout(s, "cards")).toEqual({ ...s, layout: "cards" });
  });
  it("keeps the italic line when moving between cover and close", () => {
    const s = slide({ layout: "cover", sub: "italic" });
    expect(setLayout(setLayout(s, "close"), "cover").sub).toBe("italic");
  });
  it("gives a close slide the default pills when it has none", () => {
    expect(setLayout(slide(), "close").pills).toEqual([...DEFAULT_PILLS]);
    expect(setLayout(slide({ pills: [] }), "close").pills).toEqual(["Follow", "Save", "Share"]);
  });
  it("keeps the pills a close slide already has", () => {
    expect(setLayout(slide({ pills: ["Join"] }), "close").pills).toEqual(["Join"]);
  });
  it("a statement slide keeps its text and tag but drops cards, items and pills", () => {
    const s = slide({
      layout: "close",
      kicker: "K",
      accent: "headline",
      sub: "italic",
      tag: "Build in public",
      cards: [{ text: "c", tone: "ink" }],
      items: [{ text: "i" }],
      pills: ["Follow"],
    });
    const out = setLayout(s, "statement");
    expect(out).toMatchObject({ layout: "statement", kicker: "K", headline: "A headline", accent: "headline", sub: "italic", tag: "Build in public" });
    expect(out.cards).toBeUndefined();
    expect(out.items).toBeUndefined();
    expect(out.pills).toBeUndefined();
    expect(s.cards).toHaveLength(1);
  });
  it("a statement slide with a long tag says so", () => {
    expect(slideIssues(slide({ layout: "statement", tag: "t".repeat(31) }))).toEqual(["Tag is over 30 characters."]);
    expect(slideIssues(slide({ layout: "statement", tag: " " }))).toEqual([]);
  });
  it("does not mutate the slide it is given", () => {
    const s = slide();
    setLayout(s, "close");
    expect(s.pills).toBeUndefined();
  });
});

describe("cards, items and pills", () => {
  it(`add a card up to ${MAX_CARDS}, each with text so the slide stays valid`, () => {
    let s = slide();
    for (let i = 0; i < 5; i += 1) s = addCard(s);
    expect(s.cards).toHaveLength(MAX_CARDS);
    expect(slideIssues(s)).toEqual([]);
    expect(s.cards?.[0].tone).not.toBe(s.tone);
  });
  it("update and remove a card", () => {
    let s = addCard(addCard(slide()));
    s = updateCard(s, 1, { big: "60d", label: undefined });
    expect(s.cards?.[1].big).toBe("60d");
    expect(removeCard(s, 0).cards).toHaveLength(1);
  });
  it(`add an item up to ${MAX_ITEMS}`, () => {
    let s = slide({ layout: "list" });
    for (let i = 0; i < 8; i += 1) s = addItem(s);
    expect(s.items).toHaveLength(MAX_ITEMS);
    expect(slideIssues(s)).toEqual([]);
  });
  it(`add a pill up to ${MAX_PILLS} without repeating one`, () => {
    let s = slide({ layout: "close", pills: ["Save"] });
    s = addPill(s);
    expect(s.pills).toEqual(["Save", "Follow"]);
    s = addPill(addPill(s));
    expect(s.pills).toHaveLength(MAX_PILLS);
    expect(updatePill(s, 0, "Join").pills?.[0]).toBe("Join");
  });
});

describe("slideProblems", () => {
  it("is an empty list per slide when everything passes", () => {
    expect(slideProblems(deck(3))).toEqual([[], [], []]);
  });
  it("says in words what is wrong, per slide", () => {
    const slides = [
      slide(),
      slide({ headline: "   " }),
      slide({ headline: "x".repeat(91), kicker: "k".repeat(41) }),
      slide({ cards: [{ text: "", tone: "ink" }] }),
      slide({ layout: "close", pills: ["Follow", ""] }),
      slide({ layout: "list", items: [{ text: "ok" }, { text: "y".repeat(101) }] }),
    ];
    const out = slideProblems(slides);
    expect(out[0]).toEqual([]);
    expect(out[1]).toEqual(["Add a headline."]);
    expect(out[2]).toEqual(expect.arrayContaining(["Headline is over 90 characters.", "Kicker is over 40 characters."]));
    expect(out[3]).toEqual(["Card 1 needs text."]);
    expect(out[4]).toEqual(["Pill 2 is empty."]);
    expect(out[5]).toEqual(["Item 2 text is over 100 characters."]);
  });
  it("counts a blank optional field as fine", () => {
    expect(slideIssues(slide({ kicker: "  ", accent: "", sub: "" }))).toEqual([]);
  });
  it("names too many cards", () => {
    const cards = Array.from({ length: 4 }, () => ({ text: "t", tone: "ink" as const }));
    expect(slideIssues(slide({ cards }))).toEqual(["A slide can have at most 3 cards."]);
  });
});

describe("captionCount", () => {
  it("shows 123 / 2,200", () => {
    const c = captionCount("x".repeat(123));
    expect(c.label).toBe("123 / 2,200");
    expect(c.over).toBe(false);
    expect(c.overBy).toBe(0);
  });
  it("flags a caption over the limit and says by how much", () => {
    const c = captionCount("x".repeat(2250));
    expect(c.label).toBe("2,250 / 2,200");
    expect(c.over).toBe(true);
    expect(c.overBy).toBe(50);
  });
  it("2,200 exactly is fine, and an emoji counts once", () => {
    expect(captionCount("x".repeat(2200)).over).toBe(false);
    expect(captionCount("😀".repeat(3)).length).toBe(3);
  });
});

describe("slidesEqual and tidySlide", () => {
  it("is true for the same slides, whatever the key order or blank optional text", () => {
    const a = [slide({ kicker: "K" })];
    const b = [{ headline: "A headline", kicker: "K", tone: "cream", layout: "cards", sub: "" } as Slide];
    expect(slidesEqual(a, b)).toBe(true);
  });
  it("ignores spacing that the save would trim away", () => {
    expect(slidesEqual([slide({ headline: "Hi  there " })], [slide({ headline: "Hi there" })])).toBe(true);
  });
  it("is false when a word, the count or the order differs", () => {
    expect(slidesEqual(deck(2), updateSlide(deck(2), 0, { headline: "Other" }))).toBe(false);
    expect(slidesEqual(deck(2), deck(3))).toBe(false);
    expect(slidesEqual(deck(2), moveSlide(deck(2), 0, 1))).toBe(false);
  });
  it("tidySlide drops blank optional text and does not change the slide it is given", () => {
    const s = slide({ kicker: " ", cards: [{ label: "", big: "", text: "t", tone: "ink" }] });
    const t = tidySlide(s);
    expect(t).toEqual({ layout: "cards", tone: "cream", headline: "A headline", cards: [{ text: "t", tone: "ink" }] });
    expect(s.kicker).toBe(" ");
  });
  it("normalizeSlide trims like the save, and slideKey follows it", () => {
    expect(normalizeSlide(slide({ kicker: " K " })).kicker).toBe("K");
    expect(slideKey(slide(), 0, 3)).toBe(slideKey(slide({ sub: "" }), 0, 3));
    expect(slideKey(slide(), 0, 3)).not.toBe(slideKey(slide(), 1, 3));
  });
});

describe("drawSlide", () => {
  const png = () => new Blob(["png"], { type: "image/png" });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("POSTs { slide, index, total } as JSON and returns the PNG", async () => {
    const fetchFn = vi.fn(async () => new Response(png(), { status: 200 }));
    const blob = await drawSlide(fetchFn as unknown as typeof fetch, slide({ kicker: "" }), 2, 5);
    expect(blob.type).toBe("image/png");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/carousel/slide");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      slide: { layout: "cards", tone: "cream", headline: "A headline" },
      index: 2,
      total: 5,
    });
  });
  it("throws the route's own error text on a 400", async () => {
    const fetchFn = vi.fn(async () => json(400, { error: "Too small (headline)" }));
    await expect(drawSlide(fetchFn as unknown as typeof fetch, slide(), 0, 2)).rejects.toMatchObject({
      name: "SlideDrawError",
      message: "Too small (headline)",
      status: 400,
    });
  });
  it("says something plain when the error has no JSON body", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>", { status: 502 }));
    const err = await drawSlide(fetchFn as unknown as typeof fetch, slide(), 0, 2).catch((e) => e);
    expect(err).toBeInstanceOf(SlideDrawError);
    expect(err.message).toBe("The slide service answered 502.");
  });
  it("turns a dropped connection into a readable error, but passes an abort through", async () => {
    const drop = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(drawSlide(drop as unknown as typeof fetch, slide(), 0, 2)).rejects.toThrow("Check your connection");
    const controller = new AbortController();
    controller.abort();
    const abort = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(drawSlide(abort as unknown as typeof fetch, slide(), 0, 2, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("refuses an answer that is not an image", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await expect(drawSlide(fetchFn as unknown as typeof fetch, slide(), 0, 2)).rejects.toThrow("did not send an image");
  });
});
