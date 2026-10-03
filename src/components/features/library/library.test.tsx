import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LibraryRail, { FramesStrip } from "./LibraryRail";
import LibraryTopbar from "./LibraryTopbar";
import type { Frame, LibraryFilters, Pillar } from "./types";

const pillars: Pillar[] = [
  { key: "build", name: "Build in public", color: "pillar-build", description: "", targetShare: 40, links: [] },
];
const filters: LibraryFilters = { search: "", pillar: "", platform: "" };

function frame(over: Partial<Frame>): Frame {
  return {
    _id: "f1",
    _creationTime: 0,
    key: "confession",
    name: "Confession",
    beats: [{ label: "Admit", hint: "" }, { label: "Cost", hint: "" }],
    fits: ["thread"],
    color: "pillar-build",
    usedCount: 9,
    version: 1,
    isActive: true,
    createdAt: 0,
    ...over,
  } as Frame;
}

describe("LibraryTopbar", () => {
  const bar = (tab: "published" | "drafts" | "frames" | "media") =>
    renderToStaticMarkup(
      <LibraryTopbar
        tab={tab}
        counts={{ published: 46, drafts: 12, frames: 6, media: 31 }}
        filters={filters}
        onFilters={() => {}}
        pillars={pillars}
      />
    );

  it("builds the tabs as links to real routes with live counts", () => {
    const out = bar("published");
    expect(out).toContain('href="/library"');
    expect(out).toContain('href="/library/drafts"');
    expect(out).toContain('href="/library/frames"');
    expect(out).toContain('href="/library/media"');
    expect(out).toContain(">46<");
    expect(out).toContain(">12<");
    expect(out).toContain(">31<");
  });

  it("marks only the current tab", () => {
    const out = bar("drafts");
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/href="\/library\/drafts"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/library\/drafts"/);
  });

  it("shows the pillar and platform filters on Published and Drafts only", () => {
    expect(bar("published")).toContain("Pillar · All");
    expect(bar("drafts")).toContain("Platform · Both");
    expect(bar("frames")).not.toContain("Pillar · All");
    expect(bar("media")).not.toContain("Platform · Both");
  });
});

describe("LibraryRail", () => {
  it("lists frames with their beats and use counts, the voice and New frame", () => {
    const out = renderToStaticMarkup(
      <LibraryRail frames={[frame({})]} voice="Dry founder." learnedFrom={12} />
    );
    expect(out).toContain("Confession");
    expect(out).toContain("ADMIT → COST · USED 9×");
    expect(out).toContain("Dry founder.");
    expect(out).toContain("LEARNED FROM 12 OF YOUR POSTS");
    expect(out).toContain('href="/library/frames?frame=new"');
    expect(out).not.toContain("Drafts by status");
  });

  it("adds the drafts-by-status block on Drafts", () => {
    const out = renderToStaticMarkup(
      <LibraryRail frames={[]} voice="x" learnedFrom={0} summary={{ fixing: 3, saved: 8, blog: 1 }} />
    );
    expect(out).toContain("Drafts by status");
    expect(out).toContain("Need fixing");
    expect(out).toContain("Blog drafts, never posted");
  });

  it("renders the phone strip only when there are frames", () => {
    expect(renderToStaticMarkup(<FramesStrip frames={[]} />)).toBe("");
    expect(renderToStaticMarkup(<FramesStrip frames={[frame({})]} />)).toContain("SWIPE");
  });
});
