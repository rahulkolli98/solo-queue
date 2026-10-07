import { describe, expect, it } from "vitest";
import {
  HINT_MAX,
  LABEL_MAX,
  NAME_MAX,
  addBeat,
  buildSaveArgs,
  canAddBeat,
  canPropose,
  canRemoveBeat,
  defaultButtonLabel,
  defaultSource,
  draftFromProposal,
  fitOfFormat,
  formatLabel,
  libraryFrameHref,
  postCountLabel,
  proposeArgs,
  removeBeat,
  savedMessage,
  setBeat,
  setName,
  showsSourceChoice,
  sourceLabel,
  type ProposalDraft,
} from "./frameProposer";

const draft = (n: number, format: ProposalDraft["format"] = "threads"): ProposalDraft => ({
  name: "Admit then fix",
  format,
  beats: Array.from({ length: n }, (_, i) => ({ label: `Beat ${i + 1}`, hint: `Hint ${i + 1}` })),
});

describe("source choice", () => {
  it("defaults to the topic when it is offered, else the post", () => {
    expect(defaultSource(["topic", "post"])).toBe("topic");
    expect(defaultSource(["topic"])).toBe("topic");
    expect(defaultSource(["post"])).toBe("post");
  });
  it("shows the choice only when both sources are offered", () => {
    expect(showsSourceChoice(["topic", "post"])).toBe(true);
    expect(showsSourceChoice(["post"])).toBe(false);
    expect(showsSourceChoice(["topic"])).toBe(false);
  });
  it("words the two options", () => {
    expect(sourceLabel("topic")).toBe("This topic");
    expect(sourceLabel("post")).toBe("A post I paste");
  });
});

describe("formats", () => {
  it("maps each format to the fit the backend takes, with its UI word", () => {
    expect(fitOfFormat("threads")).toBe("thread");
    expect(fitOfFormat("caption")).toBe("single");
    expect(fitOfFormat("reel")).toBe("reel");
    expect(fitOfFormat("carousel")).toBe("carousel");
    expect(formatLabel("threads")).toBe("Threads");
    expect(formatLabel("caption")).toBe("Caption");
    expect(formatLabel("reel")).toBe("Reel script");
    expect(formatLabel("carousel")).toBe("Carousel");
  });
});

describe("propose button and arguments", () => {
  it("needs 20 characters of a pasted post, nothing more for a topic", () => {
    expect(canPropose({ source: "post", text: "", busy: false })).toBe(false);
    expect(canPropose({ source: "post", text: "x".repeat(19), busy: false })).toBe(false);
    expect(canPropose({ source: "post", text: "x".repeat(20), busy: false })).toBe(true);
    expect(canPropose({ source: "post", text: `  ${"x".repeat(10)}   `, busy: false })).toBe(false);
    expect(canPropose({ source: "topic", text: "", busy: false })).toBe(true);
  });
  it("is off while busy", () => {
    expect(canPropose({ source: "topic", text: "", busy: true })).toBe(false);
    expect(canPropose({ source: "post", text: "x".repeat(40), busy: true })).toBe(false);
  });
  it("sends exactly one of topicId or text", () => {
    expect(proposeArgs({ source: "topic", format: "reel", topicId: "t1", text: "ignored" })).toEqual({ fit: "reel", topicId: "t1" });
    expect(proposeArgs({ source: "post", format: "caption", topicId: "t1", text: "  a post that worked  " })).toEqual({
      fit: "single",
      text: "a post that worked",
    });
    expect(proposeArgs({ source: "topic", format: "threads", text: "" })).toBeNull();
  });
  it("counts characters against the 6,000 limit", () => {
    expect(postCountLabel("")).toBe("0 / 6,000");
    expect(postCountLabel("abc")).toBe("3 / 6,000");
  });
});

describe("draftFromProposal", () => {
  it("turns the fit back into a format and keeps the beats inside the limits", () => {
    const d = draftFromProposal({
      name: "n".repeat(80),
      fit: "carousel",
      beats: Array.from({ length: 7 }, () => ({ label: "l".repeat(40), hint: "h".repeat(300) })),
    });
    expect(d.format).toBe("carousel");
    expect(d.name).toHaveLength(NAME_MAX);
    expect(d.beats).toHaveLength(5);
    expect(d.beats[0].label).toHaveLength(LABEL_MAX);
    expect(d.beats[0].hint).toHaveLength(HINT_MAX);
  });
});

describe("editing beats", () => {
  it("edits one beat and clips to the field limit", () => {
    const next = setBeat(draft(3), 1, "label", "x".repeat(50));
    expect(next.beats[1].label).toHaveLength(LABEL_MAX);
    expect(next.beats[0].label).toBe("Beat 1");
    expect(setBeat(draft(3), 2, "hint", "y".repeat(400)).beats[2].hint).toHaveLength(HINT_MAX);
  });
  it("ignores an unknown beat", () => {
    const d = draft(2);
    expect(setBeat(d, 5, "label", "x")).toBe(d);
  });
  it("clips the name to 60", () => {
    expect(setName(draft(2), "z".repeat(90)).name).toHaveLength(NAME_MAX);
  });
  it("cannot remove below 2 beats", () => {
    expect(canRemoveBeat(draft(2))).toBe(false);
    expect(canRemoveBeat(draft(3))).toBe(true);
    const two = draft(2);
    expect(removeBeat(two, 0)).toBe(two);
    expect(removeBeat(draft(3), 1).beats.map((b) => b.label)).toEqual(["Beat 1", "Beat 3"]);
  });
  it("cannot add above 5 beats", () => {
    expect(canAddBeat(draft(5))).toBe(false);
    expect(canAddBeat(draft(4))).toBe(true);
    const five = draft(5);
    expect(addBeat(five)).toBe(five);
    expect(addBeat(draft(2)).beats).toHaveLength(3);
    expect(addBeat(draft(2)).beats[2]).toEqual({ label: "", hint: "" });
  });
});

describe("buildSaveArgs", () => {
  it("builds frames.save arguments with a unique key, the format's fit and a pillar colour", () => {
    const res = buildSaveArgs({ ...draft(3, "reel"), name: "  Admit then fix  " }, ["admit-then-fix"]);
    expect(res).toEqual({
      ok: true,
      args: {
        key: "admit-then-fix-2",
        name: "Admit then fix",
        beats: [
          { label: "Beat 1", hint: "Hint 1" },
          { label: "Beat 2", hint: "Hint 2" },
          { label: "Beat 3", hint: "Hint 3" },
        ],
        fits: ["reel"],
        color: "pillar-build",
      },
    });
  });
  it("trims beat text", () => {
    const d = draft(2);
    d.beats[0] = { label: "  Hook  ", hint: "  Say it.  " };
    const res = buildSaveArgs(d, []);
    expect(res.ok && res.args.beats[0]).toEqual({ label: "Hook", hint: "Say it." });
  });
  it("says what is missing instead of a schema message", () => {
    expect(buildSaveArgs({ ...draft(3), name: "   " }, [])).toEqual({ ok: false, message: "Give the frame a name." });
    const d = draft(3);
    d.beats[1].label = "  ";
    expect(buildSaveArgs(d, [])).toEqual({ ok: false, message: "Beat 2 needs a name." });
  });
  it("refuses fewer than 2 or more than 5 beats using validateFrame", () => {
    const few = buildSaveArgs(draft(1), []);
    expect(few.ok).toBe(false);
    const many = buildSaveArgs(draft(6), []);
    expect(many.ok).toBe(false);
    expect(!many.ok && many.message).toMatch(/at most 5/);
  });
});

describe("words", () => {
  it("builds the saved message, the default button and the Library link", () => {
    expect(savedMessage("Admit then fix", "caption")).toBe(
      "Saved “Admit then fix”. It is in the Library and in Studio's list for Caption."
    );
    expect(defaultButtonLabel("reel")).toBe("Make it my default for Reel script");
    expect(libraryFrameHref("admit-then-fix")).toBe("/library/frames?frame=admit-then-fix");
  });
});
