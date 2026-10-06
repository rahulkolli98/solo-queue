import { describe, expect, it } from "vitest";
import {
  SUGGEST_POST_LIMIT,
  VOICE_DESCRIPTION_MAX,
  applySignOff,
  buildVoiceSuggestPrompt,
  cleanDescription,
  findBannedWords,
  limitHashtags,
} from "../../convex/lib/voiceRules";

describe("findBannedWords", () => {
  const banned = ["game-changer", "crush it", "unlock", "delve"];

  it("finds words ignoring case, in the order of the banned list", () => {
    expect(findBannedWords("We DELVE into it. Then unlock more.", banned)).toEqual(["unlock", "delve"]);
  });

  it("matches a phrase across punctuation and extra spacing", () => {
    expect(findBannedWords("Crush it!", banned)).toEqual(["crush it"]);
    expect(findBannedWords("go crush   it today", banned)).toEqual(["crush it"]);
    expect(findBannedWords("crush\nit", banned)).toEqual(["crush it"]);
  });

  it("matches whole words only, not inside other words", () => {
    expect(findBannedWords("It unlocked a door. Undelved.", banned)).toEqual([]);
    expect(findBannedWords("unlock-able", banned)).toEqual(["unlock"]);
    expect(findBannedWords("crush items", banned)).toEqual([]);
  });

  it("has Unicode-aware boundaries", () => {
    expect(findBannedWords("café", ["caf"])).toEqual([]);
    expect(findBannedWords("café au lait", ["café"])).toEqual(["café"]);
    expect(findBannedWords("ÜBER-Delve", ["delve"])).toEqual(["delve"]);
  });

  it("treats regex characters as plain text", () => {
    expect(findBannedWords("a game-changer (really)", ["game-changer", "(really)"])).toEqual(["game-changer", "(really)"]);
    expect(findBannedWords("anything at all", [".*", "a|b", "["])).toEqual([]);
    expect(findBannedWords("what? yes", ["what?"])).toEqual(["what?"]);
  });

  it("returns each word once and ignores blank entries", () => {
    expect(findBannedWords("delve delve DELVE", ["delve", "Delve", " ", ""])).toEqual(["delve"]);
  });

  it("returns nothing for empty text or an empty list", () => {
    expect(findBannedWords("", banned)).toEqual([]);
    expect(findBannedWords("unlock", [])).toEqual([]);
  });
});

describe("applySignOff", () => {
  it("appends the sign-off to the last post only", () => {
    expect(applySignOff(["one", "two"], "- R")).toEqual(["one", "two\n\n- R"]);
  });

  it("does nothing without a sign-off", () => {
    const posts = ["one"];
    expect(applySignOff(posts, undefined)).toBe(posts);
    expect(applySignOff(posts, "")).toBe(posts);
    expect(applySignOff(posts, "   ")).toBe(posts);
  });

  it("does not add it twice", () => {
    expect(applySignOff(["one", "two\n\n- R"], "- R")).toEqual(["one", "two\n\n- R"]);
  });

  it("skips it when the post would go past the limit, and uses it when it just fits", () => {
    const full = "x".repeat(499);
    expect(applySignOff([full], "- R")).toEqual([full]);
    const fits = "x".repeat(495);
    expect(applySignOff([fits], "abc")).toEqual([`${fits}\n\nabc`]); // 495 + 2 + 3 = 500
    expect(applySignOff([fits], "abcd")).toEqual([fits]);
    expect(applySignOff(["x".repeat(30)], "- R", 33)).toEqual(["x".repeat(30)]);
  });

  it("never mutates the input", () => {
    const posts = ["one", "two"];
    const out = applySignOff(posts, "- R");
    expect(posts).toEqual(["one", "two"]);
    expect(out).not.toBe(posts);
  });

  it("handles an empty thread", () => {
    expect(applySignOff([], "- R")).toEqual([]);
  });
});

describe("limitHashtags", () => {
  it("keeps the first N hashtags and drops the rest cleanly", () => {
    expect(limitHashtags("Shipped it. #build #solo #saas #ai", 2)).toBe("Shipped it. #build #solo");
  });

  it("max 0 removes them all, leaving no trailing space", () => {
    expect(limitHashtags("Shipped it. #build #solo", 0)).toBe("Shipped it.");
  });

  it("leaves text with no hashtags, or few enough, unchanged", () => {
    expect(limitHashtags("No tags  here ", 3)).toBe("No tags  here ");
    expect(limitHashtags("One #tag", 3)).toBe("One #tag");
    expect(limitHashtags("", 0)).toBe("");
  });

  it("removes an in-sentence tag without a double space", () => {
    expect(limitHashtags("I love #coding a lot #fun", 0)).toBe("I love a lot");
    expect(limitHashtags("I love #coding a lot #fun", 1)).toBe("I love #coding a lot");
  });

  it("handles a hashtag block on its own lines", () => {
    expect(limitHashtags("Line one\n\n#a #b #c\n\nLine two", 1)).toBe("Line one\n\n#a\n\nLine two");
    expect(limitHashtags("Line one\n\n#a #b #c", 0)).toBe("Line one");
    expect(limitHashtags("#a #b text", 1)).toBe("#a text");
  });

  it("only counts real hashtags", () => {
    expect(limitHashtags("C# and page#section and # alone #real", 0)).toBe("C# and page#section and # alone");
    expect(limitHashtags("#über #naïve #x", 1)).toBe("#über");
  });

  it("treats a negative or fractional max as a whole number of at least 0", () => {
    expect(limitHashtags("a #b #c", -2)).toBe("a");
    expect(limitHashtags("a #b #c", 1.9)).toBe("a #b");
  });
});

describe("cleanDescription", () => {
  it("trims, drops quotes and a leading label, and joins lines", () => {
    expect(cleanDescription('  "Dry and short.\nSays what it cost."  ')).toBe("Dry and short. Says what it cost.");
    expect(cleanDescription("Voice: Plain.")).toBe("Plain.");
  });

  it("clamps to the 600 characters the settings accept", () => {
    const out = cleanDescription("word ".repeat(400));
    expect(out.length).toBeLessThanOrEqual(VOICE_DESCRIPTION_MAX);
    expect(out).toBe(out.trimEnd());
    expect(cleanDescription("é".repeat(700))).toHaveLength(VOICE_DESCRIPTION_MAX);
  });

  it("returns an empty string for an empty answer", () => {
    expect(cleanDescription("  \n ")).toBe("");
  });
});

describe("buildVoiceSuggestPrompt", () => {
  it("includes the current description and every post, and asks for at most 600 characters", () => {
    const { system, prompt } = buildVoiceSuggestPrompt("Dry founder.", ["First post.", "Second post."]);
    expect(prompt).toContain("Dry founder.");
    expect(prompt).toContain("Post 1:\nFirst post.");
    expect(prompt).toContain("Post 2:\nSecond post.");
    expect(system).toContain("600 characters");
    expect(SUGGEST_POST_LIMIT).toBe(20);
  });

  it("says so when there is no current description, and bounds a very long post", () => {
    const { prompt } = buildVoiceSuggestPrompt("  ", ["y".repeat(5000)]);
    expect(prompt).toContain("(none yet)");
    expect(prompt.length).toBeLessThan(1500);
  });
});
