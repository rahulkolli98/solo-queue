import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Slide } from "../../convex/lib/carouselSlides";
import { themeInstructions } from "../../convex/lib/carouselDraft";
import SlideView from "@/components/carousel/SlideView";
import { appCardColors } from "@/lib/appCardPalette";
import { appHeadlineSize, appItemHeight, appRows, appSizes, fitAppCard, headlineLines } from "@/lib/carouselAppFit";

const item = (over: Partial<Slide> = {}): Slide => ({
  layout: "cards",
  tone: "cream",
  kicker: "#macapps",
  headline: "Raycast",
  sub: "A far more powerful Spotlight. Everything behind one hotkey.",
  cards: [
    { text: "Launch apps, find files, do quick math", tone: "cream" },
    { text: "Clipboard history: everything you copy is kept", tone: "cream" },
    { text: "Hundreds of extensions: translate, emoji, windows", tone: "cream" },
  ],
  tag: "Free",
  note: "Pro is paid",
  ...over,
});

describe("the App card fit", () => {
  it("gives a short name the biggest headline and a long headline a smaller one that still fits its lines", () => {
    expect(appHeadlineSize(item({ headline: "Raycast" }))).toBe(150);
    const long = item({ headline: "A very long name for one single app on one slide of the carousel" });
    const size = appHeadlineSize(long);
    expect(size).toBeLessThan(150);
    expect(headlineLines(long.headline, size)).toBeLessThanOrEqual(3);
  });

  it("draws an item slide with room to spare bigger than designed, and a crowded one smaller, always inside the page", () => {
    const sparse = fitAppCard(item());
    expect(sparse.k).toBeGreaterThan(1);
    const crowded = fitAppCard(
      item({
        headline: "A fairly long app name here",
        sub: "A long sentence about what it does that takes up two or three lines of the slide.",
        cards: Array.from({ length: 3 }, () => ({ text: "A long row of text that has to wrap onto several lines because it says a lot about this one app.", tone: "cream" as const })),
      })
    );
    expect(crowded.k).toBeLessThan(sparse.k);
    expect(crowded.fits).toBe(true);
    expect(appItemHeight(item(), appSizes(item(), sparse.k))).toBeLessThanOrEqual(1206);
  });

  it("reads the rows from cards or from a list", () => {
    expect(appRows(item()).map((r) => r.text)).toHaveLength(3);
    expect(appRows({ layout: "list", tone: "cream", headline: "Rectangle", items: [{ text: "One" }, { text: "Two" }] })).toEqual([{ text: "One" }, { text: "Two" }]);
  });

  it("picks light, dark or blue from the slide colour", () => {
    expect(appCardColors("cream").bg).toBe("#f5f5f7");
    expect(appCardColors("yellow").bg).toBe("#f5f5f7");
    expect(appCardColors("ink").bg).toBe("#1d1d1f");
    expect(appCardColors("blue").bg).toBe("#0071e3");
  });
});

describe("the App card theme draws every layout", () => {
  const slides: Slide[] = [
    { layout: "cover", tone: "cream", kicker: "Just got a new Mac?", headline: "7 apps to\ninstall first", sub: "I use every one of them", tag: "#macapps" },
    item(),
    { layout: "list", tone: "cream", headline: "Rectangle", items: [{ text: "Left half" }, { text: "Right half" }], tag: "Free" },
    { layout: "close", tone: "cream", kicker: "#macapps", headline: "Which ones do you already have?", sub: "Tell me in the comments.", pills: ["Save this", "Follow for more"] },
    { layout: "statement", tone: "ink", headline: "One idea, said loud.", accent: "said loud.", tag: "Mac tips" },
  ];

  it("renders each layout with its text, in the App card colours, and not in the Solo Queue ones", () => {
    for (const [i, slide] of slides.entries()) {
      const html = renderToStaticMarkup(SlideView({ slide, index: i, total: slides.length, theme: "app-card" }));
      expect(html, slide.layout).toContain(slide.headline.split("\n")[0].split(" ")[0]);
      expect(html, slide.layout).toMatch(/#f5f5f7|#1d1d1f|#0071e3|linear-gradient/);
      expect(html, slide.layout).not.toContain("#f0765b");
    }
    const itemHtml = renderToStaticMarkup(SlideView({ slide: item(), index: 1, total: 9, theme: "app-card" }));
    expect(itemHtml).toContain("01");
    expect(itemHtml).toContain("1 / 7");
    expect(itemHtml).toContain("Free");
    expect(itemHtml).toContain("Pro is paid");
  });

  it("tells the model how to write for it, and says nothing extra for the default theme", () => {
    const text = themeInstructions("app-card").join("\n");
    expect(text).toContain("App card");
    expect(text).toContain("cannot draw photos or app icons");
    expect(themeInstructions("solo-queue")).toEqual([]);
  });
});
