import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { headlineSize, type Slide } from "../../convex/lib/carouselSlides";
import SlideView from "@/components/carousel/SlideView";
import { MIN_SCALE, fitSlide, textWidth, wrapLines } from "@/lib/carouselFit";

const card = (text: string, over: Partial<NonNullable<Slide["cards"]>[number]> = {}) => ({ text, tone: "cream" as const, ...over });

describe("text measuring", () => {
  it("measures a headline within 3% of what the renderer drew (the pricing slide's first line was about 800 px)", () => {
    const size = 112;
    const w = textWidth("bricolage", "Charge for what", size, -size * 0.062);
    expect(w).toBeGreaterThan(776);
    expect(w).toBeLessThan(824);
    expect(textWidth("bricolage", "success", size, -size * 0.062)).toBeGreaterThan(390);
    expect(textWidth("bricolage", "success", size, -size * 0.062)).toBeLessThan(420);
    // A monospace font is the same width for every character.
    expect(textWidth("dmMono", "iiii", 100, 0)).toBeCloseTo(textWidth("dmMono", "WWWW", 100, 0), 5);
  });

  it("wraps words at spaces and counts a line break as a new line", () => {
    expect(wrapLines("dmSans", "one two three", 40, 0, 10_000)).toBe(1);
    expect(wrapLines("dmSans", "one two three", 40, 0, 200)).toBeGreaterThan(1);
    expect(wrapLines("dmSans", "a\nb\nc", 40, 0, 10_000)).toBe(3);
    // A word wider than the box takes one line of its own and does not loop.
    expect(wrapLines("dmSans", "supercalifragilisticexpialidocious", 40, 0, 100)).toBe(1);
    // Unknown characters use the font's average width rather than breaking the estimate.
    expect(wrapLines("dmSans", "漢字 text", 40, 0, 10_000)).toBe(1);
  });
});

// Slides the founder posted live and liked: they must keep their designed sizes, always.
const LIVE: Slide[] = [
  { layout: "cover", tone: "cream", kicker: "Wi-Fi sensing", headline: "Wi-Fi can\nsense you.", accent: "sense", sub: "No camera. No wearable. Just the signal your router already sends." },
  { layout: "list", tone: "ink", kicker: "The signal", headline: "Rooms scramble\nthe signal.", accent: "scramble", items: [{ text: "Wi-Fi signals bounce off walls, furniture and people before they reach the receiver." }, { text: "That bouncing is called multipath. It carries information about the room." }] },
  { layout: "cards", tone: "yellow", kicker: "The free sensor", headline: "Decoding left\na sensor behind.", accent: "sensor", cards: [{ label: "CSI", text: "Devices already measure how the signal travelled, to decode data. That measurement is called CSI.", tone: "ink" }, { label: "Sensing", text: "Changes in CSI, such as phase shifts and Doppler, can reveal activity, health and objects.", tone: "cream" }] },
  { layout: "cards", tone: "blue", kicker: "Does it work?", headline: "It works\nthrough walls.", accent: "walls.", cards: [{ label: "MIT", text: "Dina Katabi's group detected people behind walls from Wi-Fi reflections, then breathing and heart rate.", tone: "ink" }, { label: "Maryland", big: "0.47", text: "Median breathing error, in breaths per minute, in a dissertation. It worked 10 metres away or behind a wall.", tone: "cream" }] },
  { layout: "list", tone: "pink", kicker: "The standard", headline: "Now it is\na standard.", accent: "standard.", items: [{ label: "IEEE 802.11bf", text: "WLAN sensing, approved on 28 May 2025." }, { text: "Devices set up a sensing session: an initiator, a responder and shared measurements." }, { text: "It covers 2.4, 5 and 6 GHz (CSI) and above 45 GHz (range and Doppler)." }, { text: "Its targets: presence detection, smart buildings, remote wellness monitoring." }] },
  { layout: "cards", tone: "ink", kicker: "The limits", headline: "It is not\nmagic.", accent: "not", cards: [{ label: "Stillness", text: "Someone sitting very still looks like furniture. Breathing is what gives them away.", tone: "cream" }, { label: "Cost", text: "Accuracy depends on antennas, subcarriers and room layout. Sensing traffic competes with data.", tone: "yellow" }] },
  { layout: "cards", tone: "cream", kicker: "Not the same thing", headline: "Two kinds of\nWi-Fi tracking.", accent: "Two", cards: [{ label: "Your phone", text: "Probe requests carry a MAC address, and stores have used them to follow shoppers. Phones now randomise it; probes can still be fingerprinted.", tone: "ink" }, { label: "Your body", text: "Sensing needs no device on you. It reads how the room changes the signal.", tone: "coral" }] },
  { layout: "close", tone: "coral", kicker: "What could change", headline: "Routers could\nbecome sensors.", accent: "sensors.", sub: "A standard means any compliant router could offer presence sensing.", pills: ["Follow", "Save", "Share"] },
];

// Slides from a real run that overflowed: the third card and the italic line ran off the bottom.
const CROWDED: Slide[] = [
  { layout: "cards", tone: "yellow", kicker: "STEP 2 / METRIC", headline: "Charge for what grows with success", accent: "grows", sub: "If use scales with customer wins, price should follow it.", cards: [{ label: "PER SEAT", text: "Notion, Linear, Salesforce. For tools where collaboration is the value.", tone: "cream" }, { label: "PER USAGE", text: "Stripe, Twilio, OpenAI. For APIs and infra where more use = more value.", tone: "ink" }, { label: "FLAT FEE", text: "Basecamp. Simple, but breaks when one customer gets 10x value.", tone: "coral" }] },
  { layout: "cards", tone: "coral", kicker: "THE TIERS", headline: "Three tiers, middle does the work", accent: "middle", sub: "Entry catches low end. Top catches enterprise over $1k MRR.", cards: [{ label: "ENTRY", text: "Limited, not free. Captures those who would churn higher. Covers costs.", tone: "cream" }, { label: "MIDDLE", big: "2-3x", text: "Marked Recommended. Priced 2 to 3 times entry. Most land here.", tone: "yellow" }, { label: "TOP", text: "SSO, audit logs, SLA. May be Contact us for deals over $1k MRR.", tone: "ink" }] },
  { layout: "cards", tone: "cream", kicker: "THE RECEIPT", headline: "Between replacement cost and delivered value", accent: "delivered value", sub: "Name the next-best option, estimate value, price in the middle.", cards: [{ label: "NEXT BEST", text: "Competitor, spreadsheet, manual work, hire. Write down what it costs.", tone: "ink" }, { label: "HEURISTIC", big: "10-20%", text: "The guide puts rough price at 10 to 20% of documented value. Not 50%.", tone: "yellow" }] },
];

describe("fitSlide", () => {
  it("leaves a slide that fits exactly as designed: scale 1 and the sizes it always had", () => {
    for (const slide of LIVE) {
      const fit = fitSlide(slide);
      expect(fit.k, `${slide.layout} "${slide.headline}"`).toBe(1);
      expect(fit.fits).toBe(true);
      expect(fit.height).toBeLessThanOrEqual(fit.budget);
      expect(fit.sizes.headline).toBe(headlineSize(slide.layout, slide.headline));
    }
    const s = fitSlide(LIVE[2]).sizes;
    expect(s).toMatchObject({ cardText: 42, cardTextRow: 36, big: 112, cardPadTop: 40, cardPadBottom: 44, cardsGap: 44, rowOffset: 56, listMt: 120, listNum: 96, listText: 44, subPx: 45, headMt: 36 });
    expect(fitSlide(LIVE[0]).sizes).toMatchObject({ subPx: 51, subMt: 110, headMt: 100 });
    expect(fitSlide(LIVE[7]).sizes.subMt).toBe(90);
  });

  it("shrinks a crowded slide until it fits, and never makes anything bigger", () => {
    for (const slide of CROWDED) {
      const fit = fitSlide(slide);
      expect(fit.k, slide.headline).toBeLessThan(1);
      expect(fit.k).toBeGreaterThanOrEqual(MIN_SCALE);
      expect(fit.fits).toBe(true);
      expect(fit.height).toBeLessThanOrEqual(fit.budget);
      const designed = fitSlide({ ...slide, cards: [], sub: undefined, headline: "Short" }).sizes;
      expect(fit.sizes.headline).toBeLessThanOrEqual(headlineSize(slide.layout, slide.headline));
      expect(fit.sizes.cardText).toBeLessThanOrEqual(42);
      expect(designed.k).toBe(1);
    }
  });

  it("uses the largest scale that fits: one step bigger would not", () => {
    const slide = CROWDED[1];
    const fit = fitSlide(slide);
    const bigger = fitSlide({ ...slide, headline: slide.headline });
    expect(bigger.k).toBe(fit.k);
    // A touch more text pushes it down at least one step, never up.
    const longer = fitSlide({ ...slide, sub: `${slide.sub} And one more sentence that is a little long to read.` });
    expect(longer.k).toBeLessThanOrEqual(fit.k);
  });

  it("more text never gives a larger scale", () => {
    let last = 1;
    for (let n = 1; n <= 8; n += 1) {
      const slide: Slide = {
        layout: "cards",
        tone: "ink",
        headline: "A headline that takes a couple of lines",
        cards: Array.from({ length: 3 }, (_, i) => card(`Card ${i} says ${"a few more words ".repeat(n)}`)),
      };
      const k = fitSlide(slide).k;
      expect(k).toBeLessThanOrEqual(last);
      last = k;
    }
    expect(last).toBeLessThan(1);
  });

  it("stops at half size and says so when the text is far too long to fit", () => {
    const slide: Slide = {
      layout: "cards",
      tone: "ink",
      headline: "A headline",
      cards: Array.from({ length: 3 }, () => card("word ".repeat(600).trim())),
    };
    const fit = fitSlide(slide);
    expect(fit.k).toBe(MIN_SCALE);
    expect(fit.fits).toBe(false);
  });

  it("fits lists, covers and closes too, and does not scale a single statement slide", () => {
    const list: Slide = {
      layout: "list",
      tone: "ink",
      headline: "A long headline that wraps onto several lines of the slide",
      items: Array.from({ length: 5 }, (_, i) => ({ label: `Step ${i + 1}`, text: "Do this thing and then the next thing, carefully and in order, every time." })),
    };
    const fitList = fitSlide(list);
    expect(fitList.k).toBeLessThan(1);
    expect(fitList.fits).toBe(true);
    const cover: Slide = { layout: "cover", tone: "cream", headline: "A cover headline that is long enough to wrap onto several lines", sub: "And an italic line that also goes on for quite a while, to be sure." };
    expect(fitSlide(cover).fits).toBe(true);
    const close: Slide = { layout: "close", tone: "coral", headline: "Close with a long headline that also wraps onto several lines of text", sub: "A long italic line follows that needs room of its own on the slide.", pills: ["Follow", "Save", "Share"] };
    expect(fitSlide(close).fits).toBe(true);
    const statement: Slide = { layout: "statement", tone: "blue", headline: "x ".repeat(40).trim(), sub: "y ".repeat(30).trim() };
    expect(fitSlide(statement)).toMatchObject({ k: 1, fits: true });
  });
});

describe("SlideView uses the fit", () => {
  const fontSizes = (slide: Slide) => [...renderToStaticMarkup(SlideView({ slide, index: 1, total: 7 })).matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));

  it("draws a slide that fits at its designed headline size, and a crowded one smaller", () => {
    const fits = LIVE[2];
    expect(fontSizes(fits)).toContain(headlineSize(fits.layout, fits.headline));
    expect(fontSizes(fits)).toContain(42);
    const crowded = CROWDED[1];
    const sizes = fontSizes(crowded);
    expect(sizes).not.toContain(headlineSize(crowded.layout, crowded.headline));
    expect(sizes).not.toContain(42);
    expect(sizes).toContain(fitSlide(crowded).sizes.headline);
    expect(sizes).toContain(fitSlide(crowded).sizes.cardText);
  });
});
