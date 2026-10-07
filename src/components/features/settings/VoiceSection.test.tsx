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
        { key: "confession", name: "Confession" },
        { key: "hook-payoff", name: "Hook to payoff" },
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
    expect(out).toMatch(/<option value="confession" selected="">Confession<\/option>/);
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

  it("keeps a saved frame that is no longer active selectable", () => {
    voice = { ...voice, defaultFrameKey: "retired" };
    expect(render()).toContain("retired (not active)");
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
