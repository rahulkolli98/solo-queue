import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import { StudioToolbar } from "@/components/features/studio/StudioActions";
import ThreadPostRow from "@/components/features/studio/ThreadPostRow";
import { barSummary, type Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };

describe("the bottom bar for keyboard and screen-reader users", () => {
  const bar = () =>
    html(
      <StudioBottomBar
        summary={barSummary({ states: { threads: ready }, generating: false, emptySub: "" })}
        slots={[]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={vi.fn()}
        onQueue={vi.fn()}
        queuing={false}
        nextStep="Your thread is ready."
        savedText="Saved 14:32"
      />
    );

  it("is a labelled region and reads in order: next step, count, slots, blog box, then Queue", () => {
    const out = bar();
    expect(out).toContain('role="region" aria-label="Queue"');
    const at = (s: string) => out.indexOf(s);
    expect(at("studio-bar-next")).toBeLessThan(at("studio-bar-count"));
    expect(at("studio-bar-count")).toBeLessThan(at("studio-chips"));
    expect(at("studio-chips")).toBeLessThan(at("studio-blogbox"));
    expect(at("studio-blogbox")).toBeLessThan(at("studio-queuebtn"));
    expect(out).not.toMatch(/tabindex="[1-9]/);
  });

  it("keeps the next-step sentence focusable by script only, so focus can land there after Queue", () => {
    expect(bar()).toMatch(/<p class="studio-bar-next"[^>]*id="studio-next-step"[^>]*tabindex="-1"/);
  });

  it("announces the next step, the count and the saved stamp, and describes the Queue button by the next step", () => {
    const out = bar();
    expect(out).toMatch(/studio-bar-next-text" aria-live="polite"/);
    expect(out).toMatch(/studio-bar-count" aria-live="polite"/);
    expect(out).toMatch(/studio-bar-saved[^>]*role="status"/);
    expect(out).toContain('aria-describedby="studio-next-step"');
  });
});

describe("the Studio toolbar exposes the view switch and the save status", () => {
  it("marks the selected view with aria-pressed and keeps a polite save status", () => {
    const out = html(
      <StudioToolbar
        saveText="Saved 14:32"
        saveFailed={false}
        onRetrySave={vi.fn()}
        pane="threads"
        onPane={vi.fn()}
        counts={{ threads: 3, instagram: 0 }}
      />
    );
    expect(out).toContain('role="group" aria-label="Studio view"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>Threads \+ Instagram/);
    expect(out).toMatch(/aria-pressed="false"[^>]*>Blog/);
    expect(out).toMatch(/role="status" aria-live="polite"/);
  });
});

describe("removing a post says what the second press does", () => {
  const row = () =>
    html(
      <ThreadPostRow
        index={1}
        text="Some words"
        beat="Tension"
        last={false}
        onChange={vi.fn()}
        onTrim={vi.fn()}
        onSplit={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />
    );

  it("has a standing, empty status region beside the Remove button (not armed at rest)", () => {
    const out = row();
    expect(out).toMatch(/<span class="sq-sr" role="status"><\/span>/);
    expect(out).toContain('aria-label="Remove post 2"');
  });
});
