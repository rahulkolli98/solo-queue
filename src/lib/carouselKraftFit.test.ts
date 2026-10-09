import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Slide } from "../../convex/lib/carouselSlides";
import SlideView from "@/components/carousel/SlideView";
import { fitKraft, isTerminal, kraftHeadlineBase, kraftSizes, widestHeadlineWord } from "@/lib/carouselKraftFit";

const paper = (text: string, over: Partial<NonNullable<Slide["cards"]>[number]> = {}) => ({ text, tone: "cream" as const, ...over });

const THREE_CARDS: Slide = {
  layout: "cards",
  tone: "yellow",
  kicker: "STEP 2 / METRIC",
  headline: "Charge for what grows with success",
  accent: "grows",
  sub: "If use scales with customer wins, price should follow it.",
  cards: [
    paper("Notion, Linear, Salesforce. For tools where collaboration is the value.", { label: "PER SEAT" }),
    paper("Stripe, Twilio, OpenAI. For APIs and infra where more use means more value.", { label: "PER USAGE" }),
    paper("Basecamp. Simple, but breaks when one customer gets 10x the value.", { label: "FLAT FEE" }),
  ],
};

describe("fitKraft: a headline word wider than the row (I-058)", () => {
  // Inner width of a slide: 1080 wide, 80 padding each side.
  const ROW = 920;

  it("shrinks a cover whose accent word would run past the right margin", () => {
    // At the designed size "positioning," alone was 1,037px wide: no wrapping fits it, so it touched the edge.
    for (const [headline, accent] of [
      ["Pricing is positioning, not math", "positioning,"],
      ["Most SaaS is underpriced", "underpriced"],
    ] as const) {
      const slide: Slide = { layout: "cover", tone: "yellow", headline, accent };
      const fit = fitKraft(slide);
      expect(widestHeadlineWord(slide, kraftSizes(slide, 1.1))).toBeGreaterThan(ROW);
      expect(widestHeadlineWord(slide, fit.sizes)).toBeLessThanOrEqual(ROW);
      expect(fit.k).toBeLessThan(1.1);
      expect(fit.fits).toBe(true);
    }
  });

  it("leaves a cover whose words all fit at its normal size", () => {
    const slide: Slide = { layout: "cover", tone: "yellow", headline: "Charge for what grows", accent: "grows" };
    expect(fitKraft(slide).k).toBe(1.1);
  });
});

describe("fitKraft", () => {
  it("uses the largest scale that fits, never above 1.3, and the estimate stays inside the slide", () => {
    for (const slide of [THREE_CARDS, { ...THREE_CARDS, cards: THREE_CARDS.cards!.slice(0, 1), sub: undefined }]) {
      const fit = fitKraft(slide);
      expect(fit.fits).toBe(true);
      expect(fit.k).toBeLessThanOrEqual(1.3);
      expect(fit.k).toBeGreaterThanOrEqual(0.5);
      expect(fit.height).toBeLessThanOrEqual(fit.budget);
      // One step bigger would not fit (unless it is already at the cap).
      if (fit.k < 1.3) expect(fitKraft(slide).k).toBe(fit.k);
    }
  });

  it("draws a sparse slide bigger than a crowded one, and a crowded one smaller than its designed size", () => {
    const sparse = fitKraft({ layout: "cards", tone: "ink", kicker: "THE RECEIPT", headline: "Three tiers", cards: [paper("One short card.", { label: "ENTRY" })] });
    const crowded = fitKraft(THREE_CARDS);
    expect(sparse.k).toBe(1.3);
    expect(crowded.k).toBeLessThan(sparse.k);
    const longer = fitKraft({ ...THREE_CARDS, headline: "A much longer headline that wraps onto several lines of the slide for sure", cards: THREE_CARDS.cards!.map((c) => ({ ...c, text: `${c.text} And a little more to say here.` })) });
    expect(longer.k).toBeLessThan(crowded.k);
    expect(longer.fits).toBe(true);
  });

  it("scales a cover less (it is already large), and a one-slide statement the same way", () => {
    const cover: Slide = { layout: "cover", tone: "cream", headline: "Short", sub: "A line." };
    expect(fitKraft(cover).k).toBe(1.1);
    expect(fitKraft({ ...cover, layout: "statement" }).k).toBe(1.1);
    expect(kraftHeadlineBase(cover)).toBeGreaterThan(kraftHeadlineBase({ ...THREE_CARDS }));
  });

  it("more text never gives a larger scale, and text far too long stops at half size and says so", () => {
    let last = 2;
    for (let n = 1; n <= 8; n += 1) {
      const k = fitKraft({ ...THREE_CARDS, cards: THREE_CARDS.cards!.map((c) => ({ ...c, text: `${c.text} ${"more words here ".repeat(n)}` })) }).k;
      expect(k).toBeLessThanOrEqual(last);
      last = k;
    }
    const hopeless = fitKraft({ ...THREE_CARDS, cards: THREE_CARDS.cards!.map((c) => ({ ...c, text: "word ".repeat(700).trim() })) });
    expect(hopeless.k).toBe(0.5);
    expect(hopeless.fits).toBe(false);
  });

  it("fits lists, terminal cards, closes and a note row, and counts a figure card taller than a plain one", () => {
    const list: Slide = { layout: "list", tone: "ink", kicker: "STEP 1", headline: "A list with a long headline that wraps", note: "start here", items: Array.from({ length: 5 }, (_, i) => ({ label: `Step ${i + 1}`, text: "Do this thing, carefully and in order, every single time." })) };
    expect(fitKraft(list).fits).toBe(true);
    const terminal: Slide = { layout: "cards", tone: "ink", kicker: "STEP 3", headline: "Raise prices", cards: [{ label: "plan", text: "$ notice 60-90 days\n$ explain the reason\n$ offer an annual lock", tone: "ink" }] };
    expect(isTerminal(terminal.cards![0])).toBe(true);
    expect(fitKraft(terminal).fits).toBe(true);
    const close: Slide = { layout: "close", tone: "coral", kicker: "NEXT", headline: "Pick a metric, test one change", sub: "Audit your tiers.", pills: ["Follow", "Save", "Share"] };
    expect(fitKraft(close).fits).toBe(true);
    const plain = fitKraft({ layout: "cards", tone: "ink", headline: "H", cards: [paper("Text.")] }, false);
    const figure = fitKraft({ layout: "cards", tone: "ink", headline: "H", cards: [paper("Text.", { big: "40" })] }, false);
    expect(figure.height).toBeGreaterThan(plain.height);
    // The last slide has no swipe cue, so it has more room and is never drawn smaller.
    expect(fitKraft(THREE_CARDS, true).k).toBeGreaterThanOrEqual(fitKraft(THREE_CARDS, false).k);
  });

  it("sizes shrink and grow together: the headline, the card text and the figure move with the scale", () => {
    const small = kraftSizes(THREE_CARDS, 0.6);
    const big = kraftSizes(THREE_CARDS, 1.2);
    expect(small.headline).toBeLessThan(big.headline);
    expect(small.cardText).toBeLessThan(big.cardText);
    expect(small.big).toBeLessThan(big.big);
    expect(kraftSizes(THREE_CARDS, 1).headline).toBe(kraftHeadlineBase(THREE_CARDS));
  });
});

describe("SlideView picks the design", () => {
  const slide: Slide = { layout: "cards", tone: "yellow", kicker: "THE RECEIPT", headline: "A receipt", accent: "receipt", cards: [paper("Text.", { big: "40", label: "COST" })], note: "under 40" };
  const markup = (theme?: string) => renderToStaticMarkup(SlideView({ slide, index: 1, total: 7, theme }));

  it("draws Solo Queue for no theme, for Solo Queue and for an unknown theme, and the kraft design for Kraft zine", () => {
    const solo = markup();
    expect(markup("solo-queue")).toBe(solo);
    expect(markup("neon")).toBe(solo);
    const kraft = markup("kraft-zine");
    expect(kraft).not.toBe(solo);
    expect(kraft).toContain("font-family:Anton");
    expect(kraft).toContain("font-family:Playfair");
    expect(kraft).toContain("font-family:Marker");
    expect(kraft).toContain("under 40");
    expect(solo).not.toContain("font-family:Anton");
    // Solo Queue does not draw the note.
    expect(solo).not.toContain("under 40");
  });
});
