import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../../convex/lib/settingsModel";

let voice: Record<string, unknown> = {};
let loaded = true;
vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    const name = String(ref);
    if (name === "frames.list") {
      return [
        { key: "confession", name: "Confession", isActive: true, fits: ["thread", "reel"] },
        { key: "hook-payoff", name: "Hook to payoff", isActive: true, fits: ["thread"] },
        { key: "ig-caption", name: "IG caption", isActive: true, fits: ["single", "carousel"] },
        { key: "ig-reel", name: "IG reel", isActive: true, fits: ["reel"] },
        { key: "quiet-single", name: "Quiet single", isActive: true, fits: ["single"] },
      ];
    }
    return loaded ? { ...DEFAULT_SETTINGS, voice } : undefined;
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    settings: { get: "settings.get", update: "settings.update" },
    frames: { list: "frames.list" },
    voice: { suggest: "voice.suggest" },
  },
}));

import VoiceSection from "./VoiceSection";

const render = () => renderToStaticMarkup(<VoiceSection />);

/** The markup of one select, found by its aria-label. */
const selectOf = (out: string, label: string) => {
  const m = out.match(new RegExp(`<select[^>]*aria-label="${label}"[^>]*>.*?</select>`));
  if (!m) throw new Error(`no select "${label}"`);
  return m[0];
};
/** The markup of one format row, up to the next row or the end of the card. */
const rowOf = (out: string, label: string) => {
  const m = out.match(new RegExp(`aria-label="${label} defaults">.*?(?=role="group"|</section>)`));
  if (!m) throw new Error(`no row "${label}"`);
  return m[0];
};

describe("VoiceSection", () => {
  beforeEach(() => {
    loaded = true;
    voice = { ...DEFAULT_SETTINGS.voice, description: "Dry founder.", learnedFromCount: 12, signOff: "Follow the build" };
  });

  it("shows the saved description with a live count, the learned-from line and the retrain button", () => {
    const out = render();
    expect(out).toContain("Dry founder.");
    expect(out).toContain("12/600");
    expect(out).toContain("Learned from 12 posts");
    expect(out).toContain("Retrain from my published posts");
    // Enabled at rest (it only disables while a suggestion is being written).
    expect(out).toMatch(/<button type="button" class="sq-btn sq-btn-sm st-retrain">Retrain from my published posts<\/button>/);
  });

  it("says so plainly when nothing has been learned yet", () => {
    voice = { ...voice, learnedFromCount: 0 };
    expect(render()).toContain("Not learned from your posts yet");
  });

  it("shows the saved selects, sign-off and banned-word chips with remove buttons", () => {
    const out = render();
    expect(out).toContain('value="Follow the build"');
    expect(out).toMatch(/<option value="5" selected="">5<\/option>/);
    for (const w of ["game-changer", "crush it", "unlock", "delve"]) {
      expect(out).toContain(`<span>${w}</span>`);
      expect(out).toContain(`aria-label="Remove ${w}"`);
    }
    expect(out).toContain('maxLength="600"');
    expect(out).toContain('maxLength="80"');
  });

  it("includes a saved hashtag value that is not in the usual list", () => {
    voice = { ...voice, igHashtagMax: 7 };
    expect(render()).toMatch(/<option value="7" selected="">7<\/option>/);
  });

  it("has a Defaults by format card with a row each for Threads, Caption, Reel script, Carousel and Blog", () => {
    const out = render();
    expect(out).toContain('aria-label="Defaults by format"');
    for (const label of ["Threads", "Caption", "Reel script", "Carousel", "Blog"]) {
      expect(out).toContain(`aria-label="${label} defaults"`);
    }
    expect(out).not.toContain("arrive in a later update");
    expect(out).not.toContain("Default story frame");
  });

  it("checks Include by default for Threads, Caption and Reel script, and not for Blog", () => {
    const out = render();
    expect(rowOf(out, "Threads")).toMatch(/type="checkbox" checked=""/);
    expect(rowOf(out, "Caption")).toMatch(/type="checkbox" checked=""/);
    expect(rowOf(out, "Reel script")).toMatch(/type="checkbox" checked=""/);
    expect(rowOf(out, "Blog")).not.toContain("checked");
    expect(rowOf(out, "Blog")).toContain("Include by default");
  });

  it("honours a saved include of false and true", () => {
    voice = { ...voice, formatDefaults: { caption: { include: false }, blog: { include: true } } };
    const out = render();
    expect(rowOf(out, "Caption")).not.toContain("checked");
    expect(rowOf(out, "Blog")).toMatch(/type="checkbox" checked=""/);
  });

  it("lists only the active frames that fit each format, with the effective default selected", () => {
    const out = render();
    const threads = selectOf(out, "Threads story frame");
    // The older single default (confession) fits a thread, so it is the effective default.
    expect(threads).toMatch(/<option value="confession" selected="">Confession<\/option>/);
    expect(threads).toContain("Hook to payoff");
    expect(threads).not.toContain("IG caption");
    expect(threads).not.toContain("IG reel");
    const caption = selectOf(out, "Caption story frame");
    expect(caption).toMatch(/<option value="ig-caption" selected="">IG caption<\/option>/);
    expect(caption).toContain("Quiet single");
    expect(caption).not.toContain("Confession");
    const reel = selectOf(out, "Reel script story frame");
    expect(reel).toMatch(/<option value="confession" selected="">Confession<\/option>/);
    expect(reel).toContain("IG reel");
    expect(reel).not.toContain("Hook to payoff");
  });

  it("selects the frame saved for a format", () => {
    voice = { ...voice, formatDefaults: { caption: { frameKey: "quiet-single" }, threads: { frameKey: "hook-payoff" } } };
    const out = render();
    expect(selectOf(out, "Caption story frame")).toMatch(/<option value="quiet-single" selected="">/);
    expect(selectOf(out, "Threads story frame")).toMatch(/<option value="hook-payoff" selected="">/);
  });

  it("falls through to the next default when the saved frame is not active or does not fit", () => {
    // resolveFrameKey ignores a saved frame that is retired or does not fit the format, so the select shows
    // what a run would use: the older default, then the seeded frame.
    voice = { ...voice, defaultFrameKey: "retired", formatDefaults: { caption: { frameKey: "retired-too" }, reel: { frameKey: "hook-payoff" } } };
    const out = render();
    expect(out).not.toContain("not active");
    expect(selectOf(out, "Caption story frame")).toMatch(/<option value="ig-caption" selected="">/);
    expect(selectOf(out, "Reel script story frame")).toMatch(/<option value="ig-reel" selected="">/);
    // No thread frame is left to fall to: the select asks for a choice rather than showing a wrong one.
    expect(selectOf(out, "Threads story frame")).toContain("Choose a story frame");
  });

  it("gives Blog no story frame and only Threads a Posts select", () => {
    const out = render();
    expect(rowOf(out, "Blog")).toContain("No story frame");
    expect(rowOf(out, "Blog")).not.toContain("<select");
    expect(rowOf(out, "Caption")).not.toContain('aria-label="Threads posts"');
    expect(rowOf(out, "Reel script")).not.toContain('aria-label="Threads posts"');
  });

  it("gives the Carousel a story frame and a slides select of 1 to 10, defaulting to 6, and no carousel is written by default", () => {
    const out = render();
    const row = rowOf(out, "Carousel");
    expect(row).toContain('aria-label="Carousel story frame"');
    const slides = selectOf(out, "Carousel slides");
    expect(slides).toMatch(/<option value="0" selected="">6 slides \(default\)<\/option>/);
    expect(slides).toContain('<option value="1">1 slide (single statement)</option>');
    expect(slides).toContain('<option value="4">4 slides</option>');
    expect(slides).toContain('<option value="10">10 slides</option>');
    expect(slides).not.toContain('value="0"></option>');
    expect(slides).not.toContain('value="11"');
    // The "Include by default" box is off (the Instagram platform box beside it is on).
    expect(row).toMatch(/id="fmt-carousel-include" type="checkbox"\/>/);
  });

  it("says where the carousel is posted: Instagram by default, with Threads as a second box, and the last one stays on", () => {
    const out = render();
    const row = rowOf(out, "Carousel");
    expect(row).toContain("Post to");
    expect(row).toMatch(/id="fmt-carousel-instagram" type="checkbox" disabled="" checked=""/);
    expect(row).toMatch(/id="fmt-carousel-threads" type="checkbox"\/>/);

    voice = { ...voice, formatDefaults: { carousel: { targets: ["instagram", "threads"] } } };
    const both = rowOf(render(), "Carousel");
    expect(both).toMatch(/id="fmt-carousel-instagram" type="checkbox" checked=""\/>/);
    expect(both).toMatch(/id="fmt-carousel-threads" type="checkbox" checked=""\/>/);

    voice = { ...voice, formatDefaults: { carousel: { targets: ["threads"] } } };
    const threadsOnly = rowOf(render(), "Carousel");
    expect(threadsOnly).toMatch(/id="fmt-carousel-threads" type="checkbox" disabled="" checked=""/);
    expect(threadsOnly).toMatch(/id="fmt-carousel-instagram" type="checkbox"\/>/);
  });

  it("offers Follow the story frame plus 2 to 12 posts, selected from the saved count", () => {
    let posts = selectOf(render(), "Threads posts");
    expect(posts).toMatch(/<option value="0" selected="">Follow the story frame<\/option>/);
    expect(posts).toContain('<option value="2">2 posts</option>');
    expect(posts).toContain('<option value="12">12 posts</option>');
    expect(posts).not.toContain('value="1"');
    expect(posts).not.toContain('value="13"');

    voice = { ...voice, formatDefaults: { threads: { count: 7 } } };
    posts = selectOf(render(), "Threads posts");
    expect(posts).toMatch(/<option value="7" selected="">7 posts<\/option>/);
  });

  it("still counts the older thread length when no per-format count is saved", () => {
    voice = { ...voice, defaultPostCount: 5 };
    expect(selectOf(render(), "Threads posts")).toMatch(/<option value="5" selected="">5 posts<\/option>/);
  });

  it("has a polite status region and no suggestion box until one is requested", () => {
    const out = render();
    expect(out).toContain('aria-live="polite"');
    expect(out).not.toContain("Use this");
    expect(out).not.toContain("Keep mine");
  });

  it("does not render a Threads topic tag control", () => {
    const out = render().toLowerCase();
    expect(out).not.toContain("topic tag");
    expect(out).not.toContain("topic-tag");
    expect(out).not.toContain("threadstopictag");
  });

  it("shows About you and the style guide with live counts and a Load from file button", () => {
    voice = { ...voice, aboutMe: "Solo founder.", styleGuide: "Open with a confession." };
    const out = render();
    expect(out).toContain("Solo founder.");
    expect(out).toContain("13/1500");
    expect(out).toContain("Open with a confession.");
    expect(out).toContain("23/20,000");
    expect(out).toContain("Load from file");
    expect(out).toContain("Sent with every draft");
    expect(out).toContain(">Clear</button>");
    expect(out).toContain('accept=".md,.markdown,.txt,text/markdown,text/plain"');
    // Nothing to save until the text is edited.
    expect(out).not.toContain("Save style guide");
  });

  it("is optional: empty fields show placeholders, no Clear button and no error", () => {
    const out = render();
    expect(out).toContain("Paste a style guide here.");
    expect(out).toContain("0/20,000");
    expect(out).not.toContain(">Clear</button>");
    expect(out).not.toContain("sq-formfield-error");
  });

  it("shows a loading line until settings arrive", () => {
    loaded = false;
    expect(render()).toContain("Loading voice settings");
  });
});
