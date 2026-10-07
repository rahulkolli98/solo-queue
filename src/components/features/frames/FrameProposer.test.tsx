import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { FrameProposer, ProposerEdit, ProposerForm, ProposerSaved } from "./FrameProposer";
import type { ProposalDraft } from "@/lib/frameProposer";

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));

const topic = { id: "t1" as Id<"topics">, title: "Threads API limits" };

/** The opening tag plus text of the first button whose text starts with `text`, or null. */
function button(html: string, text: string): string | null {
  const m = new RegExp(`<button[^>]*>${text}[^<]*</button>`).exec(html);
  return m ? m[0] : null;
}

function form(over: Partial<Parameters<typeof ProposerForm>[0]> = {}) {
  return renderToStaticMarkup(
    <ProposerForm
      topic={{ title: "Threads API limits" }}
      sources={["topic", "post"]}
      source="topic"
      text=""
      format="threads"
      busy={false}
      error={null}
      onSource={() => {}}
      onText={() => {}}
      onFormat={() => {}}
      onSubmit={() => {}}
      {...over}
    />
  );
}

describe("FrameProposer (first render)", () => {
  it("starts on the form with 'This topic' chosen when both sources are offered", () => {
    useQueryMock.mockReturnValue(undefined);
    const out = renderToStaticMarkup(<FrameProposer topic={topic} sources={["topic", "post"]} frames={[]} />);
    expect(out).toContain("This topic");
    expect(out).toContain("A post I paste");
    expect(button(out, "This topic")).toContain('aria-checked="true"');
    expect(button(out, "A post I paste")).toContain('aria-checked="false"');
    expect(out).not.toContain("<textarea");
    expect(button(out, "Propose beats")).not.toContain("disabled");
    expect(out).not.toContain("Save frame");
  });

  it("shows only the paste box for a post-only proposer, with Propose off", () => {
    useQueryMock.mockReturnValue(undefined);
    const out = renderToStaticMarkup(<FrameProposer sources={["post"]} frames={[]} />);
    expect(out).not.toContain("This topic");
    expect(out).not.toContain("A post I paste");
    expect(out).toContain("<textarea");
    expect(out).toContain('maxLength="6000"');
    expect(out).toContain('placeholder="Paste a post that worked."');
    expect(out).toContain("0 / 6,000");
    expect(button(out, "Propose beats")).toContain("disabled");
  });
});

describe("ProposerForm", () => {
  it("offers the four formats as a radiogroup with Threads chosen", () => {
    const out = form();
    expect(out).toContain('role="radiogroup"');
    for (const label of ["Threads", "Caption", "Reel script", "Carousel"]) expect(button(out, label)).toContain('role="radio"');
    expect(button(out, "Threads")).toContain('aria-checked="true"');
    expect(button(out, "Reel script")).toContain('aria-checked="false"');
  });

  it("shows the paste box only for the post source, and the topic line only for the topic", () => {
    expect(form({ source: "topic" })).not.toContain("<textarea");
    expect(form({ source: "topic" })).toContain("Threads API limits");
    const post = form({ source: "post", text: "short" });
    expect(post).toContain("<textarea");
    expect(post).not.toContain("Suggests beats");
    expect(post).toContain("5 / 6,000");
  });

  it("keeps Propose off until a pasted post has 20 characters", () => {
    expect(button(form({ source: "post", text: "x".repeat(19) }), "Propose beats")).toContain("disabled");
    expect(button(form({ source: "post", text: "x".repeat(20) }), "Propose beats")).not.toContain("disabled");
  });

  it("says it is working while busy, and disables Propose", () => {
    const out = form({ busy: true });
    expect(out).toContain("Writing the beats…");
    expect(out).toContain('role="status"');
    expect(button(out, "Propose beats")).toContain("disabled");
    expect(form()).not.toContain("Writing the beats");
  });

  it("shows an error in an alert", () => {
    const out = form({ error: "That is 6,500 characters; keep it under 6,000." });
    expect(out).toMatch(/<p[^>]*role="alert"[^>]*>That is 6,500 characters/);
  });
});

const draft = (n: number): ProposalDraft => ({
  name: "Admit then fix",
  format: "reel",
  beats: Array.from({ length: n }, (_, i) => ({ label: `Beat ${i + 1}`, hint: `Hint ${i + 1}` })),
});

function edit(n: number, error: string | null = null) {
  return renderToStaticMarkup(
    <ProposerEdit draft={draft(n)} busy={false} error={error} onChange={() => {}} onSave={() => {}} onStartOver={() => {}} />
  );
}

describe("ProposerEdit", () => {
  it("shows the name, the beats with limits, the format as text and the two buttons", () => {
    const out = edit(3);
    expect(out).toContain('value="Admit then fix"');
    expect(out).toContain('maxLength="60"');
    expect(out).toContain('aria-label="Beat 3 name"');
    expect(out).toContain('aria-label="Beat 3 hint"');
    expect(out).toContain('maxLength="30"');
    expect(out).toContain('maxLength="200"');
    expect(out).toContain("For Reel script.");
    expect(button(out, "Save frame")).toBeTruthy();
    expect(button(out, "Start over")).toBeTruthy();
  });

  it("cannot remove at 2 beats and cannot add at 5", () => {
    const two = edit(2);
    expect(two.match(/aria-label="Remove beat \d"[^>]*disabled/g)).toHaveLength(2);
    expect(button(two, "Add beat")).not.toContain("disabled");
    const five = edit(5);
    expect(five).not.toMatch(/aria-label="Remove beat \d"[^>]*disabled/);
    expect(button(five, "Add beat")).toContain("disabled");
  });

  it("shows a validation message in an alert", () => {
    expect(edit(3, "Beat 2 needs a name.")).toMatch(/role="alert"[^>]*>Beat 2 needs a name\./);
  });
});

function saved(over: Partial<Parameters<typeof ProposerSaved>[0]> = {}) {
  return renderToStaticMarkup(
    <ProposerSaved
      name="Admit then fix"
      frameKey="admit-then-fix"
      format="caption"
      canSetDefault
      defaultSet={false}
      defaultBusy={false}
      defaultError={null}
      onMakeDefault={() => {}}
      onAnother={() => {}}
      {...over}
    />
  );
}

describe("ProposerSaved", () => {
  it("says where the frame went and links to it in the Library", () => {
    const out = saved();
    expect(out).toContain("Saved “Admit then fix”. It is in the Library and in Studio&#x27;s list for Caption.");
    expect(out).toContain('href="/library/frames?frame=admit-then-fix"');
    expect(out).toContain("Open in Library");
    expect(button(out, "Make it my default for Caption")).toBeTruthy();
    expect(button(out, "Make another")).toBeTruthy();
  });

  it("hides the default button while settings are not loaded", () => {
    expect(saved({ canSetDefault: false })).not.toContain("Make it my default");
  });

  it("shows a Close button only when the parent wants one", () => {
    expect(saved()).not.toContain("Close");
    expect(saved({ onDone: () => {} })).toContain("Close");
  });

  it("disables the default button once it is set", () => {
    expect(button(saved({ defaultSet: true }), "Your default for Caption")).toContain("disabled");
  });
});
