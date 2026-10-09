import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LooksSection, { LookEditor } from "./LooksSection";
import { draftFromLook, emptyDraft, startPlan } from "@/lib/looksEditor";

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const plan = [
  { layout: "cover", tone: "coral" },
  { layout: "cards", tone: "cream" },
  { layout: "list", tone: "yellow" },
  { layout: "close", tone: "ink" },
] as const;
const look = {
  _id: "l1",
  _creationTime: 0,
  key: "calm-explainer",
  name: "Calm explainer",
  plan: [...plan, ...plan.slice(1, 3)],
  design: "# Calm\n\nQuiet colours and plain words.",
  referenceIds: ["m1", "m2"],
  usedCount: 3,
  createdAt: 0,
  updatedAt: 0,
};

function list(rows: unknown) {
  useQueryMock.mockImplementation(() => rows);
}

describe("LooksSection", () => {
  beforeEach(() => useQueryMock.mockReset());

  it("explains what a look is and offers New look", () => {
    list([]);
    const out = renderToStaticMarkup(<LooksSection />);
    expect(out).toContain("Carousel looks");
    expect(out).toContain("A look is a saved carousel design: a theme, a slide plan, a design document, reference images, or any mix. Pick one when you write a carousel.");
    expect(out).toMatch(/<button[^>]*id="lk-new"[^>]*>New look<\/button>/);
  });

  it("shows an empty state when there are no looks", () => {
    list([]);
    const out = renderToStaticMarkup(<LooksSection />);
    expect(out).toContain("No looks yet");
    expect(out).not.toContain("lk-card");
  });

  it("says it is loading while the list arrives", () => {
    list(undefined);
    expect(renderToStaticMarkup(<LooksSection />)).toContain("Loading your looks");
  });

  it("shows a card per look with its parts, an Edit button and a Delete button", () => {
    list([look]);
    const out = renderToStaticMarkup(<LooksSection />);
    expect(out).toContain("Calm explainer");
    expect(out).toContain("PLAN · 6 SLIDES");
    expect(out).toContain("DESIGN DOC");
    expect(out).toContain("2 REFERENCES");
    expect(out).toContain("USED 3×");
    expect(out).toContain('aria-label="Edit look Calm explainer"');
    expect(out).toContain('aria-label="Delete look Calm explainer"');
    // a short read of the design document, and the plan as coloured blocks (colours come from the stylesheet)
    expect(out).toContain("Calm Quiet colours and plain words.");
    expect(out).toContain('data-tone="coral"');
    expect(out).not.toMatch(/#[0-9a-f]{6}/i);
    // deleting is a two-step action: nothing is confirmed until the founder presses Delete
    expect(out).not.toContain("Yes, delete");
    // the editor is closed until asked for
    expect(out).not.toContain('id="lk-editor"');
  });

  it("shows a look's theme as a chip", () => {
    list([{ ...look, _id: "l3", key: "zine", name: "Zine", plan: undefined, design: undefined, referenceIds: undefined, theme: "kraft-zine" }]);
    const out = renderToStaticMarkup(<LooksSection />);
    expect(out).toContain("THEME · KRAFT ZINE");
  });

  it("shows only the parts a look has", () => {
    list([{ ...look, _id: "l2", key: "plain", name: "Plain", plan: undefined, design: undefined, referenceIds: undefined, usedCount: 0 }]);
    const out = renderToStaticMarkup(<LooksSection />);
    expect(out).toContain("USED 0×");
    expect(out).not.toContain("DESIGN DOC");
    expect(out).not.toContain("REFERENCE");
    expect(out).not.toContain("lk-strip");
  });
});

describe("LookEditor", () => {
  beforeEach(() => useQueryMock.mockReset());
  const noop = () => {};

  it("starts a new look with a name, no plan and the three parts explained", () => {
    useQueryMock.mockReturnValue(undefined);
    const out = renderToStaticMarkup(<LookEditor initial={emptyDraft()} usedCount={0} onSaved={noop} onCancel={noop} />);
    expect(out).toContain('aria-label="New look"');
    expect(out).toContain(">Name</label>");
    expect(out).toContain("Start a plan");
    expect(out).not.toContain("Add slide");
    expect(out).toContain("0 / 12,000");
    expect(out).toContain("Upload a .md or .txt file");
    expect(out).toContain("Reference images");
    expect(out).toContain("5 MB each");
    expect(out).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(out).toContain("Save look");
    expect(out).toContain(">Cancel<");
    // no problems are shown before the founder tries to save
    expect(out).not.toContain('role="alert"');
  });

  it("offers a Design select: no theme first, then every theme, with the chosen theme's blurb", () => {
    useQueryMock.mockReturnValue(undefined);
    const empty = renderToStaticMarkup(<LookEditor initial={emptyDraft()} usedCount={0} onSaved={noop} onCancel={noop} />);
    expect(empty).toContain(">Design</label>");
    expect(empty).toMatch(/<option value="" selected="">No theme \(the run decides\)<\/option>/);
    expect(empty).toContain('<option value="solo-queue">Solo Queue</option>');
    expect(empty).toContain('<option value="kraft-zine">Kraft zine</option>');
    expect(empty).toContain("Leave it out and the run picks one");
    const zine = renderToStaticMarkup(
      <LookEditor initial={{ ...emptyDraft(), name: "Zine", theme: "kraft-zine" }} usedCount={0} onSaved={noop} onCancel={noop} />
    );
    expect(zine).toMatch(/<option value="kraft-zine" selected="">Kraft zine<\/option>/);
    expect(zine).toContain("A printed zine on kraft paper");
    expect(zine).not.toContain("Leave it out and the run picks one");
  });

  it("shows the plan rows with labelled selects, swatches and move, remove and add controls", () => {
    useQueryMock.mockReturnValue(undefined);
    const draft = startPlan({ ...emptyDraft(), name: "X" });
    const out = renderToStaticMarkup(<LookEditor initial={draft} usedCount={0} onSaved={noop} onCancel={noop} />);
    expect(out).toContain('aria-label="Slide 1 layout"');
    expect(out).toContain('aria-label="Slide 3 colour"');
    expect(out).toContain('aria-label="Move slide 2 up"');
    expect(out).toContain('aria-label="Remove slide 2"');
    expect(out).toContain("Add slide");
    expect(out).toContain("Remove plan");
    expect(out).not.toContain("Start a plan");
    expect(out).toContain('data-tone="coral"');
    // the cover and the close cannot move or be removed; the only middle slide has no neighbour to swap with
    expect(out).toMatch(/aria-label="Move slide 1 up"[^>]*disabled/);
    expect(out).toMatch(/aria-label="Remove slide 1"[^>]*disabled/);
    expect(out).toMatch(/aria-label="Remove slide 3"[^>]*disabled/);
    expect(out).toMatch(/aria-label="Move slide 2 up"[^>]*disabled/);
    // the cover's layout is fixed
    expect(out).toMatch(/aria-label="Slide 1 layout"[^>]*disabled/);
    expect(out).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("opens an existing look with its parts, its use and its references", () => {
    useQueryMock.mockReturnValue([
      { _id: "m1", publicUrl: "https://files.test/a.png", filename: "a.png" },
      { _id: "m2", publicUrl: "https://files.test/b.png", filename: "b.png" },
    ]);
    const out = renderToStaticMarkup(
      <LookEditor initial={draftFromLook({ ...look, plan: look.plan })} usedCount={3} onSaved={noop} onCancel={noop} />
    );
    expect(out).toContain('aria-label="Edit look"');
    expect(out).toContain("USED 3×");
    expect(out).toContain('value="Calm explainer"');
    expect(out).toContain("Save changes");
    expect(out).toContain('aria-label="Slide 6 layout"');
    expect(out).toContain("Quiet colours and plain words.");
    expect(out).toContain('alt="Reference image 1: a.png"');
    expect(out).toContain('aria-label="Remove reference image 2: b.png"');
    expect(out).toContain("2 OF 6");
  });

  it("marks a design document over the limit", () => {
    useQueryMock.mockReturnValue(undefined);
    const out = renderToStaticMarkup(
      <LookEditor initial={{ ...emptyDraft(), name: "Long", design: "x".repeat(12001) }} usedCount={0} onSaved={noop} onCancel={noop} />
    );
    expect(out).toContain("12,001 / 12,000");
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("is-over");
  });
});
