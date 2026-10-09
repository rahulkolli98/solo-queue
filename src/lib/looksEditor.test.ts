import { describe, expect, it } from "vitest";
import {
  DESIGN_MAX,
  addPlanSlide,
  addReferences,
  canAddPlanSlide,
  canMovePlanSlide,
  canRemovePlanSlide,
  canSave,
  designCount,
  designExcerpt,
  designFileProblem,
  designTextProblem,
  draftFromLook,
  emptyDraft,
  layoutChoices,
  lookProblems,
  lookSaveArgs,
  movePlanSlide,
  normalizePlan,
  partsSummary,
  pickReferenceFiles,
  referenceFileProblem,
  removePlan,
  removePlanSlide,
  removeReference,
  setPlanLayout,
  setPlanTone,
  startPlan,
  type LookDraft,
} from "./looksEditor";

const planned = (): LookDraft => startPlan({ ...emptyDraft(), name: "Calm" });
const grown = (n: number): LookDraft => {
  let d = planned();
  for (let i = 0; i < n; i += 1) d = addPlanSlide(d);
  return d;
};
const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("the slide plan", () => {
  it("starts as a cover, one cards slide and a close", () => {
    const d = planned();
    expect(d.plan?.map((s) => s.layout)).toEqual(["cover", "cards", "close"]);
  });

  it("does not replace a plan that already exists", () => {
    const d = setPlanTone(planned(), 1, "blue");
    expect(startPlan(d)).toBe(d);
  });

  it("can be removed", () => {
    expect(removePlan(planned()).plan).toBeNull();
  });

  it("adds a cards slide before the close and stops at ten", () => {
    const d = addPlanSlide(planned());
    expect(d.plan?.map((s) => s.layout)).toEqual(["cover", "cards", "cards", "close"]);
    const full = grown(20);
    expect(full.plan).toHaveLength(10);
    expect(canAddPlanSlide(full)).toBe(false);
    expect(addPlanSlide(full)).toBe(full);
    expect(full.plan?.at(-1)?.layout).toBe("close");
  });

  it("does nothing to a look with no plan", () => {
    const d = emptyDraft();
    expect(addPlanSlide(d)).toBe(d);
    expect(removePlanSlide(d, 1)).toBe(d);
    expect(movePlanSlide(d, 1, 1)).toBe(d);
    expect(setPlanTone(d, 0, "ink")).toBe(d);
    expect(canAddPlanSlide(d)).toBe(false);
  });

  it("removes only middle slides and never below two slides", () => {
    const d = grown(2);
    expect(d.plan).toHaveLength(5);
    expect(canRemovePlanSlide(d, 0)).toBe(false);
    expect(canRemovePlanSlide(d, 4)).toBe(false);
    expect(canRemovePlanSlide(d, 2)).toBe(true);
    expect(removePlanSlide(d, 2).plan).toHaveLength(4);
    expect(removePlanSlide(d, 0)).toBe(d);
    expect(removePlanSlide(d, 4)).toBe(d);
    // Three slides is the smallest plan with a middle slide; removing it leaves a cover and a close.
    const small = removePlanSlide(removePlanSlide(removePlanSlide(d, 3), 2), 1);
    expect(small.plan?.map((s) => s.layout)).toEqual(["cover", "close"]);
    expect(canRemovePlanSlide(small, 1)).toBe(false);
  });

  it("moves only middle slides, and only among the middle", () => {
    let d = grown(2);
    d = setPlanTone(setPlanTone(setPlanTone(d, 1, "blue"), 2, "pink"), 3, "yellow");
    const tones = (x: LookDraft) => x.plan?.map((s) => s.tone);
    expect(tones(movePlanSlide(d, 1, 1))).toEqual(["coral", "pink", "blue", "yellow", "ink"]);
    expect(tones(movePlanSlide(d, 3, -1))).toEqual(["coral", "blue", "yellow", "pink", "ink"]);
    // the cover and the close never move, and nothing moves into their place
    expect(canMovePlanSlide(d, 0, 1)).toBe(false);
    expect(canMovePlanSlide(d, 4, -1)).toBe(false);
    expect(canMovePlanSlide(d, 1, -1)).toBe(false);
    expect(canMovePlanSlide(d, 3, 1)).toBe(false);
    expect(movePlanSlide(d, 1, -1)).toBe(d);
    expect(movePlanSlide(d, 3, 1)).toBe(d);
    expect(movePlanSlide(d, 0, 1)).toBe(d);
  });

  it("keeps the first slide a cover and the last a close, with cards or a list between", () => {
    const d = grown(1);
    expect(layoutChoices(0, 4)).toEqual(["cover"]);
    expect(layoutChoices(3, 4)).toEqual(["close"]);
    expect(layoutChoices(1, 4)).toEqual(["cards", "list"]);
    expect(setPlanLayout(d, 1, "list").plan?.[1].layout).toBe("list");
    expect(setPlanLayout(d, 1, "cover")).toBe(d);
    expect(setPlanLayout(d, 1, "close")).toBe(d);
    expect(setPlanLayout(d, 0, "list")).toBe(d);
    expect(setPlanLayout(d, 3, "cards")).toBe(d);
    expect(setPlanLayout(d, 9, "cards")).toBe(d);
  });

  it("sets a slide's colour", () => {
    const d = setPlanTone(planned(), 2, "yellow");
    expect(d.plan?.[2]).toEqual({ layout: "close", tone: "yellow" });
    expect(setPlanTone(d, 7, "ink")).toBe(d);
  });

  it("normalises a plan whose ends are wrong", () => {
    expect(
      normalizePlan([
        { layout: "cards", tone: "ink" },
        { layout: "cover", tone: "cream" },
        { layout: "list", tone: "pink" },
        { layout: "cards", tone: "blue" },
      ]).map((s) => s.layout)
    ).toEqual(["cover", "cards", "list", "close"]);
  });
});

describe("saving", () => {
  it("needs a name", () => {
    expect(lookProblems({ ...planned(), name: "  " })).toContain("Give the look a name.");
    expect(canSave({ ...planned(), name: "  " })).toBe(false);
    expect(canSave(planned())).toBe(true);
  });

  it("limits the name to 60 characters", () => {
    expect(canSave({ ...planned(), name: "a".repeat(60) })).toBe(true);
    expect(lookProblems({ ...planned(), name: "a".repeat(61) })).toEqual(["Keep the name under 60 characters."]);
  });

  it("needs at least one part", () => {
    const bare = { ...emptyDraft(), name: "Nothing" };
    expect(lookProblems(bare)[0]).toMatch(/at least one thing/);
    expect(canSave({ ...bare, design: "   \n " })).toBe(false);
    expect(canSave({ ...bare, design: "Warm and plain." })).toBe(true);
    expect(canSave({ ...bare, referenceIds: ["m1"] })).toBe(true);
    expect(canSave({ ...bare, plan: [{ layout: "cover", tone: "ink" }, { layout: "close", tone: "cream" }] })).toBe(true);
  });

  it("limits the design document to 12,000 characters", () => {
    const base = { ...emptyDraft(), name: "Doc" };
    expect(canSave({ ...base, design: "x".repeat(DESIGN_MAX) })).toBe(true);
    expect(lookProblems({ ...base, design: "x".repeat(DESIGN_MAX + 1) })[0]).toMatch(/over 12,000 characters/);
  });

  it("limits the plan and the references", () => {
    const base = { ...emptyDraft(), name: "Odd" };
    expect(lookProblems({ ...base, plan: [{ layout: "cover", tone: "ink" }] })[0]).toMatch(/2 to 10 slides/);
    expect(lookProblems({ ...base, referenceIds: ["1", "2", "3", "4", "5", "6", "7"] })[0]).toMatch(/6 reference images/);
    expect(canSave({ ...base, referenceIds: ["1", "2", "3", "4", "5", "6"] })).toBe(true);
  });

  it("builds the save arguments, leaving out empty parts", () => {
    expect(lookSaveArgs({ ...emptyDraft(), name: "  Calm   explainer ", design: "Quiet.\r\nPlain." })).toEqual({
      name: "Calm explainer",
      design: "Quiet.\nPlain.",
    });
    const edit = lookSaveArgs({ key: "calm", name: "Calm", plan: planned().plan, design: "  ", referenceIds: ["m1", "m2"] });
    expect(edit).toEqual({
      key: "calm",
      name: "Calm",
      plan: planned().plan,
      referenceIds: ["m1", "m2"],
    });
    expect("design" in edit).toBe(false);
    expect("key" in lookSaveArgs(planned())).toBe(false);
  });

  it("builds a draft from a saved look without sharing its arrays", () => {
    const plan = [{ layout: "cover" as const, tone: "ink" as const }, { layout: "close" as const, tone: "cream" as const }];
    const draft = draftFromLook({ key: "k", name: "K", plan, design: "d", referenceIds: ["a"], usedCount: 2 });
    expect(draft).toEqual({ key: "k", name: "K", plan, design: "d", referenceIds: ["a"] });
    expect(draft.plan?.[0]).not.toBe(plan[0]);
    expect(draftFromLook({ key: "k", name: "K", usedCount: 0 })).toEqual({ key: "k", name: "K", plan: null, design: "", referenceIds: [] });
  });
});

describe("the design document", () => {
  it("counts like the server does", () => {
    expect(designCount("")).toBe("0 / 12,000");
    expect(designCount("  ab\r\ncd ")).toBe("5 / 12,000");
  });

  it("accepts Markdown and plain text files", () => {
    expect(designFileProblem(file("look.md", "text/markdown"))).toBeNull();
    expect(designFileProblem(file("look.md", ""))).toBeNull();
    expect(designFileProblem(file("LOOK.TXT", "text/plain"))).toBeNull();
  });

  it("refuses other files by name", () => {
    expect(designFileProblem(file("look.pdf", "application/pdf"))).toMatch(/look\.pdf: only a Markdown/);
    expect(designFileProblem(file("look.docx", ""))).toMatch(/only a Markdown/);
    expect(designFileProblem(file("photo.png", "image/png"))).toMatch(/only a Markdown/);
    expect(designFileProblem(file("look.md", "image/png"))).toMatch(/only a Markdown/);
  });

  it("refuses a file too big to fit before reading it", () => {
    expect(designFileProblem(file("big.md", "text/markdown", DESIGN_MAX * 4 + 1))).toMatch(/too long/);
    expect(designFileProblem(file("ok.md", "text/markdown", DESIGN_MAX * 4))).toBeNull();
  });

  it("refuses text that is empty, binary or over 12,000 characters", () => {
    expect(designTextProblem("a.md", "Warm, plain.")).toBeNull();
    expect(designTextProblem("a.md", "x".repeat(DESIGN_MAX))).toBeNull();
    expect(designTextProblem("a.md", "x".repeat(DESIGN_MAX + 1))).toMatch(/a\.md: that file has 12,001 characters/);
    expect(designTextProblem("a.md", "  \n ")).toMatch(/empty/);
    expect(designTextProblem("a.md", "ab\u0000cd")).toMatch(/not look like a text file/);
  });
});

describe("reference images", () => {
  it("takes PNG, JPEG and WebP up to 5 MB", () => {
    expect(referenceFileProblem(file("a.png", "image/png"))).toBeNull();
    expect(referenceFileProblem(file("a.jpg", "image/jpeg"))).toBeNull();
    expect(referenceFileProblem(file("a.webp", "image/webp", 5 * 1024 * 1024))).toBeNull();
    expect(referenceFileProblem(file("a.gif", "image/gif"))).toMatch(/a\.gif: only PNG, JPEG or WebP/);
    expect(referenceFileProblem(file("a.png", "image/png", 5 * 1024 * 1024 + 1))).toMatch(/a\.png: too big/);
  });

  it("names every refused file and stops at the room left", () => {
    const out = pickReferenceFiles([file("1.png", "image/png"), file("2.gif", "image/gif"), file("3.webp", "image/webp"), file("4.png", "image/png")], 2);
    expect(out.accepted.map((f) => f.name)).toEqual(["1.png", "3.webp"]);
    expect(out.refused).toHaveLength(2);
    expect(out.refused[0]).toMatch(/2\.gif/);
    expect(out.refused[1]).toMatch(/4\.png: a look holds 6 reference images at most/);
    expect(pickReferenceFiles([file("1.png", "image/png")], 0).accepted).toEqual([]);
  });

  it("adds each image once, up to six, and removes one", () => {
    let d = addReferences(emptyDraft(), ["a", "b", "a"]);
    expect(d.referenceIds).toEqual(["a", "b"]);
    d = addReferences(d, ["c", "d", "e", "f", "g"]);
    expect(d.referenceIds).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(removeReference(d, "c").referenceIds).toEqual(["a", "b", "d", "e", "f"]);
  });
});

describe("designExcerpt", () => {
  it("flattens Markdown and line breaks", () => {
    expect(designExcerpt("# Calm look\n\n- **Quiet** colours\n- plain words")).toBe("Calm look Quiet colours plain words");
  });

  it("cuts a long document at a word with an ellipsis", () => {
    const out = designExcerpt("word ".repeat(100), 20);
    expect(out).toBe("word word word word…");
    expect(designExcerpt("short")).toBe("short");
  });
});

describe("partsSummary", () => {
  const plan = [{ layout: "cover" as const, tone: "ink" as const }, { layout: "close" as const, tone: "cream" as const }];
  it("lists the parts a look has, then its use", () => {
    expect(partsSummary({ plan: [...plan, ...plan, ...plan], design: "x", referenceIds: ["a", "b"], usedCount: 3 })).toEqual([
      "PLAN · 6 SLIDES",
      "DESIGN DOC",
      "2 REFERENCES",
      "USED 3×",
    ]);
  });

  it("leaves out the parts it does not have and says one reference in the singular", () => {
    expect(partsSummary({ design: "  ", referenceIds: ["a"], usedCount: 0 })).toEqual(["1 REFERENCE", "USED 0×"]);
    expect(partsSummary({ usedCount: 1 })).toEqual(["USED 1×"]);
  });
});
