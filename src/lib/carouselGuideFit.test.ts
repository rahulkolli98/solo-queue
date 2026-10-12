import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Slide } from "../../convex/lib/carouselSlides";
import { themeInstructions } from "../../convex/lib/carouselDraft";
import SlideView from "@/components/carousel/SlideView";
import { boxLines, fitGuide, guideBoxes, guideContentHeight, guideHeadlineSize, headLineCount, headlineCandidates, underlineSpan } from "@/lib/carouselGuideFit";

const step = (over: Partial<Slide> = {}): Slide => ({
  layout: "cards",
  tone: "cream",
  headline: "1. TELL CLAUDE\nWHAT YOU WANT",
  accent: "WHAT YOU WANT",
  note: "plain English is enough",
  cards: [
    { text: "make a mod that shows my next steps after every reply", tone: "ink" },
    { text: "update to v2.1.287 or later\ndescribe the mod you want\nClaude writes the code", tone: "cream" },
  ],
  tag: "@name",
  ...over,
});

describe("the Orange guide fit", () => {
  it("keeps the headline's own line breaks when a size allows it, and falls back to wrapping when none does", () => {
    const two = step();
    const size = guideHeadlineSize(two);
    expect(headLineCount(two.headline, size)).toBe(2);
    const long = step({ headline: "COMMENT \"MODS\"\nFOR THE LIST OF 1,000+ MODS EVERY WEEK FOR FREE", layout: "close" });
    expect(headlineCandidates(long).length).toBeGreaterThan(0);
    expect(headLineCount(long.headline, headlineCandidates(long)[0])).toBeGreaterThanOrEqual(2);
  });

  it("draws everything inside the page: a crowded slide is drawn smaller, and the estimate fits", () => {
    const crowded = step({
      cards: [
        { text: "a very long command that wraps onto several lines of the window because it says a lot about the thing", tone: "ink" },
        { text: "one line that is long enough to wrap\nanother line that is long enough to wrap\na third line that is long enough to wrap", tone: "cream" },
      ],
    });
    const fit = fitGuide(crowded);
    expect(fit.fits).toBe(true);
    expect(fit.k).toBeLessThanOrEqual(1);
    expect(guideContentHeight(crowded, fit.sizes)).toBeLessThanOrEqual(1206);
  });

  it("turns a dark card into a command window, any other card into a takeaway box, and a list into one box", () => {
    expect(guideBoxes(step()).map((b) => b.kind)).toEqual(["terminal", "callout"]);
    expect(guideBoxes(step())[1].lines).toHaveLength(3);
    const list: Slide = { layout: "list", tone: "cream", headline: "THE HONEST CATCH", items: [{ text: "one" }, { text: "two" }, { text: "three" }] };
    expect(guideBoxes(list)).toEqual([{ kind: "callout", lines: ["one", "two", "three"] }]);
    expect(guideBoxes({ layout: "cover", tone: "cream", headline: "X", sub: "> plugins" })[0].kind).toBe("terminal");
    expect(boxLines("a\r\n\nb\n")).toEqual(["a", "b"]);
  });

  it("underlines the accent words at the right end of the last line, and nothing when that line wraps or has no accent", () => {
    const size = guideHeadlineSize(step());
    const span = underlineSpan(step(), size);
    expect(span).not.toBeNull();
    expect(span!.accentWidth).toBeLessThanOrEqual(span!.lineWidth);
    expect(underlineSpan(step({ accent: undefined }), size)).toBeNull();
    expect(underlineSpan(step({ headline: "ONE\nA VERY VERY LONG LAST LINE THAT CANNOT FIT ON ONE LINE AT THIS SIZE", accent: "FIT" }), 190)).toBeNull();
  });
});

describe("the Orange guide theme draws every layout", () => {
  const slides: Slide[] = [
    { layout: "cover", tone: "cream", headline: "CLAUDE CODE\nJUST GOT MODS", accent: "MODS", note: "like Minecraft mods, but for Claude Code", sub: "plugins, hooks", tag: "@name" },
    step(),
    { layout: "list", tone: "cream", headline: "THE HONEST CATCH\nCHECK BEFORE YOU INSTALL", accent: "CHECK BEFORE YOU INSTALL", items: [{ text: "a mod can read your files" }, { text: "the list is not official" }], tag: "@name" },
    { layout: "close", tone: "cream", headline: "COMMENT \"MODS\"\nFOR THE LIST", accent: "FOR THE LIST", note: "in your DMs", sub: "Community mods", pills: ["Status line", "Theme", "Hooks"], tag: "@name" },
    { layout: "statement", tone: "cream", headline: "WHAT JUST DROPPED\nOCT 1, 2026", accent: "OCT 1, 2026", tag: "@name" },
  ];

  it("renders each layout with its text, the counter, the footer and the guide colours", () => {
    for (const [i, slide] of slides.entries()) {
      const html = renderToStaticMarkup(SlideView({ slide, index: i, total: 9, theme: "orange-guide" }));
      expect(html, slide.layout).toContain(`${i + 1}/9`);
      expect(html, slide.layout).toContain("save for later");
      expect(html, slide.layout).toContain("#ff4e14");
      expect(html, slide.layout).toContain("@name");
    }
    const stepHtml = renderToStaticMarkup(SlideView({ slide: step(), index: 2, total: 9, theme: "orange-guide" }));
    expect(stepHtml).toContain("plain English is enough");
    expect(stepHtml).toContain("Claude writes the code");
  });

  it("tells the model how to write for it", () => {
    const text = themeInstructions("orange-guide").join("\n");
    expect(text).toContain("Orange guide");
    expect(text).toContain("cannot draw characters, icons or photos");
  });
});
