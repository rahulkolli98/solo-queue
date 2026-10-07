import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sectionSchemas, type Pillar } from "../../convex/lib/settingsModel";
import {
  ABOUT_ME_MAX,
  STYLE_GUIDE_FILE_MAX_BYTES,
  STYLE_GUIDE_MAX,
  addBannedWord,
  addPillarLink,
  checkStyleGuideFile,
  clampShare,
  frameOptions,
  igHashtagOptions,
  learnedFromText,
  mergePillar,
  mergeVoice,
  mixLabel,
  mixSegments,
  normaliseBannedWord,
  pillarColorVar,
  removeBannedWord,
  removePillarLink,
  shareTotal,
  shareTotalWarning,
  validatePillarName,
  validateAboutMe,
  validateSignOff,
  validateStyleGuide,
} from "./settingsEdit";

const pillars = DEFAULT_SETTINGS.pillars;
const withShares = (shares: number[]): Pillar[] => pillars.map((p, i) => ({ ...p, targetShare: shares[i] }));

describe("never-use words", () => {
  it("lowercases, trims and collapses spaces", () => {
    expect(normaliseBannedWord("  Game   CHANGER ")).toBe("game changer");
  });

  it("adds a normalised word to the end", () => {
    const r = addBannedWord(["unlock"], "  Delve ");
    expect(r).toEqual({ ok: true, value: ["unlock", "delve"] });
  });

  it("refuses empty, over-long, duplicate (any case) and a full list, with a plain message", () => {
    expect(addBannedWord([], "   ")).toMatchObject({ ok: false });
    expect(addBannedWord([], "x".repeat(41))).toMatchObject({ ok: false, message: expect.stringContaining("40") });
    expect(addBannedWord(["unlock"], "UNLOCK")).toMatchObject({ ok: false, message: expect.stringContaining("already") });
    const full = Array.from({ length: 50 }, (_, i) => `w${i}`);
    expect(addBannedWord(full, "extra")).toMatchObject({ ok: false, message: expect.stringContaining("50") });
    expect(addBannedWord(full.slice(0, 49), "extra")).toMatchObject({ ok: true });
  });

  it("accepts exactly 40 characters", () => {
    expect(addBannedWord([], "x".repeat(40))).toMatchObject({ ok: true });
  });

  it("removes one word and leaves the rest", () => {
    expect(removeBannedWord(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("voice helpers", () => {
  it("words the learned-from line", () => {
    expect(learnedFromText(0)).toBe("Not learned from your posts yet");
    expect(learnedFromText(1)).toBe("Learned from 1 post");
    expect(learnedFromText(12)).toBe("Learned from 12 posts");
  });

  it("offers the fixed hashtag choices plus an unusual saved value", () => {
    expect(igHashtagOptions(5)).toEqual([0, 1, 2, 3, 5, 8, 10]);
    expect(igHashtagOptions(7)).toEqual([0, 1, 2, 3, 5, 7, 8, 10]);
    expect(igHashtagOptions(30)).toEqual([0, 1, 2, 3, 5, 8, 10, 30]);
  });

  it("keeps the saved frame selectable when it is not in the active list", () => {
    const frames = [{ key: "confession", name: "Confession" }];
    expect(frameOptions(frames, "confession")).toEqual([{ key: "confession", label: "Confession" }]);
    expect(frameOptions(frames, "old")[0]).toEqual({ key: "old", label: "old (not active)" });
    expect(frameOptions(undefined, "confession")).toEqual([{ key: "confession", label: "confession" }]);
  });

  it("merges into the COMPLETE voice object and keeps the fields it was not asked to change", () => {
    const base = { ...DEFAULT_SETTINGS.voice, defaultPostCount: 5, signOff: "Follow along" };
    const next = mergeVoice(base, { igHashtagMax: 3 });
    expect(next).toEqual({ ...base, igHashtagMax: 3 });
    expect(next.defaultPostCount).toBe(5);
    expect(next.threadsTopicTag).toBe("auto");
  });

  it("removes the sign-off field when it is cleared, instead of sending an empty string", () => {
    const base = { ...DEFAULT_SETTINGS.voice, signOff: "Follow along" };
    const cleared = mergeVoice(base, { signOff: "   " });
    expect("signOff" in cleared).toBe(false);
    expect(mergeVoice(base, { signOff: "" })).not.toHaveProperty("signOff");
    expect(mergeVoice(base, { signOff: "  New  " }).signOff).toBe("New");
  });

  it("produces a voice object the backend schema accepts", () => {
    const next = mergeVoice({ ...DEFAULT_SETTINGS.voice, signOff: "x" }, { signOff: "", bannedWords: ["a"] });
    expect(sectionSchemas.voice.safeParse(next).success).toBe(true);
  });

  it("checks the sign-off length", () => {
    expect(validateSignOff("x".repeat(80))).toBeNull();
    expect(validateSignOff("x".repeat(81))).toContain("80");
  });
});

describe("pillar helpers", () => {
  it("clamps a share to a whole number from 0 to 100", () => {
    expect(clampShare("40")).toBe(40);
    expect(clampShare("40.6")).toBe(41);
    expect(clampShare("150")).toBe(100);
    expect(clampShare("-5")).toBe(0);
    expect(clampShare(12.2)).toBe(12);
  });

  it("returns null for something that is not a number", () => {
    expect(clampShare("")).toBeNull();
    expect(clampShare("  ")).toBeNull();
    expect(clampShare("abc")).toBeNull();
    expect(clampShare(Number.NaN)).toBeNull();
  });

  it("validates a name of 1 to 40 characters", () => {
    expect(validatePillarName("  Build  ")).toEqual({ ok: true, value: "Build" });
    expect(validatePillarName("   ")).toMatchObject({ ok: false });
    expect(validatePillarName("x".repeat(41))).toMatchObject({ ok: false });
  });

  it("adds and removes linked products, with limits", () => {
    expect(addPillarLink(["flofield"], " postship ")).toEqual({ ok: true, value: ["flofield", "postship"] });
    expect(addPillarLink(["flofield"], "FloField")).toMatchObject({ ok: false });
    expect(addPillarLink([], "")).toMatchObject({ ok: false });
    expect(addPillarLink([], "x".repeat(41))).toMatchObject({ ok: false });
    const eight = Array.from({ length: 8 }, (_, i) => `p${i}`);
    expect(addPillarLink(eight, "ninth")).toMatchObject({ ok: false, message: expect.stringContaining("8") });
    expect(removePillarLink(["a", "b"], "a")).toEqual(["b"]);
  });

  it("changes one pillar and returns the whole array, other pillars untouched", () => {
    const next = mergePillar(pillars, "tools", { targetShare: 10 });
    expect(next).toHaveLength(4);
    expect(next.find((p) => p.key === "tools")?.targetShare).toBe(10);
    expect(next.filter((p) => p.key !== "tools")).toEqual(pillars.filter((p) => p.key !== "tools"));
    expect(sectionSchemas.pillars.safeParse(next).success).toBe(true);
  });

  it("maps a colour token to a CSS variable and falls back for anything else", () => {
    expect(pillarColorVar("pillar-build")).toBe("var(--color-pillar-build)");
    expect(pillarColorVar("red; background: url(x)")).toBe("var(--color-line)");
  });
});

describe("target mix", () => {
  it("sizes segments by share and totals them", () => {
    const segs = mixSegments(pillars);
    expect(segs.map((s) => s.widthPct)).toEqual([40, 30, 15, 15]);
    expect(shareTotal(pillars)).toBe(100);
    expect(shareTotalWarning(100)).toBeNull();
  });

  it("leaves a gap when the total is under 100", () => {
    const segs = mixSegments(withShares([40, 30, 10, 10]));
    expect(segs.reduce((s, x) => s + x.widthPct, 0)).toBe(90);
  });

  it("scales down so the bar still fits when the total is over 100", () => {
    const segs = mixSegments(withShares([50, 50, 50, 50]));
    expect(segs.every((s) => s.widthPct === 25)).toBe(true);
  });

  it("warns in plain words when the total is not 100", () => {
    expect(shareTotalWarning(90)).toBe("Shares add up to 90%. Posts will still be queued; the mix bar is a target.");
    expect(shareTotalWarning(110)).toContain("110%");
  });

  it("labels the bar with each name and percent", () => {
    expect(mixLabel(pillars)).toBe("Build in public 40%, AI & tools 30%, Movies & series 15%, Content craft 15%");
  });
});

describe("about you and style guide", () => {
  const base = { ...DEFAULT_SETTINGS.voice };

  it("saves trimmed text and removes the field when blank", () => {
    const saved = mergeVoice(base, { aboutMe: "  Solo founder.  ", styleGuide: "  Short lines.  " });
    expect(saved.aboutMe).toBe("Solo founder.");
    expect(saved.styleGuide).toBe("Short lines.");
    const cleared = mergeVoice(saved, { aboutMe: "   ", styleGuide: "" });
    expect(cleared).not.toHaveProperty("aboutMe");
    expect(cleared).not.toHaveProperty("styleGuide");
  });

  it("leaves them alone when another field changes", () => {
    const saved = mergeVoice(base, { aboutMe: "Me", styleGuide: "Guide" });
    const next = mergeVoice(saved, { signOff: "Bye" });
    expect(next.aboutMe).toBe("Me");
    expect(next.styleGuide).toBe("Guide");
  });

  it("refuses text over the limits, saying how long the style guide is", () => {
    expect(validateAboutMe("x".repeat(ABOUT_ME_MAX))).toBeNull();
    expect(validateAboutMe("x".repeat(ABOUT_ME_MAX + 1))).toMatch(/1,?500/);
    expect(validateStyleGuide("x".repeat(STYLE_GUIDE_MAX))).toBeNull();
    expect(validateStyleGuide("x".repeat(STYLE_GUIDE_MAX + 1))).toBe(
      "The style guide is 20,001 characters; the limit is 20,000. Cut it down, then save."
    );
  });

  it("accepts only small .md and .txt files", () => {
    expect(checkStyleGuideFile({ name: "voice.md", size: 5000 })).toBeNull();
    expect(checkStyleGuideFile({ name: "VOICE.TXT", size: 5000 })).toBeNull();
    expect(checkStyleGuideFile({ name: "voice.pdf", size: 5000 })).toMatch(/\.md or \.txt/);
    expect(checkStyleGuideFile({ name: "voice.md", size: STYLE_GUIDE_FILE_MAX_BYTES + 1 })).toMatch(/too large/);
  });

  it("the settings model allows the same lengths", () => {
    const schema = sectionSchemas.voice;
    expect(schema.safeParse({ ...base, aboutMe: "x".repeat(ABOUT_ME_MAX), styleGuide: "x".repeat(STYLE_GUIDE_MAX) }).success).toBe(true);
    expect(schema.safeParse({ ...base, aboutMe: "x".repeat(ABOUT_ME_MAX + 1) }).success).toBe(false);
    expect(schema.safeParse({ ...base, styleGuide: "x".repeat(STYLE_GUIDE_MAX + 1) }).success).toBe(false);
  });
});
