import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LibraryControls from "./LibraryControls";
import type { LibraryFilters } from "./types";

const base: LibraryFilters = { search: "", pillar: "", platform: "", topicId: "", format: "", sort: "newest" };
const topics = [
  { id: "t1", title: "Pricing", count: 3 },
  { id: "t2", title: "Wi-Fi", count: 1 },
];
const render = (over: Partial<LibraryFilters> = {}, props: Partial<Parameters<typeof LibraryControls>[0]> = {}) =>
  renderToStaticMarkup(
    <LibraryControls
      filters={{ ...base, ...over }}
      onView={vi.fn()}
      dateWord="added"
      topics={topics}
      shown={4}
      total={4}
      noun="draft"
      narrowed={false}
      onClear={vi.fn()}
      {...props}
    />
  );

describe("LibraryControls", () => {
  it("offers the sort, topic and format choices, named for what the dates mean", () => {
    const out = render();
    expect(out).toContain('aria-label="Sort"');
    expect(out).toContain("Recently added");
    expect(out).toContain("Topic A to Z");
    expect(out).toContain("Pricing (3)");
    expect(out).toContain("Wi-Fi (1)");
    expect(out).toContain("Blog draft");
    expect(render({}, { dateWord: "published" })).toContain("Recently published");
  });

  it("does not offer Blog on the published list (a blog draft is never posted)", () => {
    expect(render({}, { dateWord: "published" })).not.toContain("Blog draft");
  });

  it("shows the count, and Clear filters only while something narrows the list", () => {
    const plain = render();
    expect(plain).toContain("4 DRAFTS");
    expect(plain).not.toContain("Clear filters");
    const narrowed = render({ topicId: "t1" }, { narrowed: true, shown: 3 });
    expect(narrowed).toContain("3 OF 4 DRAFTS");
    expect(narrowed).toContain("Clear filters");
  });

  it("keeps a topic from the address selectable even when this list has none of it", () => {
    expect(render({ topicId: "elsewhere" })).toContain("Topic · none here");
  });
});
