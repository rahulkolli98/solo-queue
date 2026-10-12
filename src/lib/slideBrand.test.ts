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
