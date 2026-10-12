import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { validateSlide, type Slide } from "../../convex/lib/carouselSlides";
import SlideView from "@/components/carousel/SlideView";

const statement = (over: Partial<Slide> = {}): Slide => ({ layout: "statement", tone: "cream", kicker: "THE CLIMB", headline: "A goat climbs one step at a time.", tag: "Swipe", ...over });

describe("a slide's brand name", () => {
  it("replaces the solo queue wordmark (and its dot) on a statement slide", () => {
    const own = renderToStaticMarkup(SlideView({ slide: statement({ brand: "FloField" }), index: 0, total: 1 }));
    expect(own).toContain("FloField");
    expect(own).not.toContain("solo queue");
    const base = renderToStaticMarkup(SlideView({ slide: statement(), index: 0, total: 1 }));
    expect(base).toContain("solo queue");
    expect(base).not.toContain("FloField");
  });

  it("is checked against its limit", () => {
    expect(validateSlide(statement({ brand: "FloField" })).ok).toBe(true);
    expect(validateSlide(statement({ brand: "x".repeat(21) })).ok).toBe(false);
  });
});

import { fitSlide, statementHeadlineSize } from "@/lib/carouselFit";
import { headlineSize } from "../../convex/lib/carouselSlides";

describe("a statement slide fills the page", () => {
  it("grows a short headline well past the designed size, and never shrinks one", () => {
    const short = statement({ headline: "One goat, one step at a time." });
    expect(statementHeadlineSize(short)).toBeGreaterThan(headlineSize("statement", short.headline) + 20);
    expect(fitSlide(short).sizes.headline).toBe(statementHeadlineSize(short));
    const long = statement({ headline: "A slip is part of the climb. The next step is the part you control and so on and on." });
    expect(statementHeadlineSize(long)).toBeGreaterThanOrEqual(headlineSize("statement", long.headline));
  });
});
