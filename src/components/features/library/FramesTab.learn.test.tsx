import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FramesTab from "./FramesTab";
import type { Frame, LibraryFilters } from "./types";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const filters: LibraryFilters = { search: "", pillar: "", platform: "", topicId: "", format: "", sort: "newest" };
const frame = {
  _id: "f1",
  _creationTime: 0,
  key: "confession",
  name: "Confession",
  beats: [
    { label: "Admit", hint: "" },
    { label: "Cost", hint: "" },
  ],
  fits: ["thread"],
  color: "pillar-build",
  usedCount: 1,
  version: 1,
  isActive: true,
  createdAt: 0,
} as Frame;

describe("FramesTab: Learn from a post", () => {
  const out = renderToStaticMarkup(<FramesTab filters={filters} pillars={[]} frames={[frame]} voice={undefined} />);

  it("is a real button card next to New frame, closed at first", () => {
    expect(out).toMatch(/<button[^>]*class="lb-fc lb-fc-learn"[^>]*aria-expanded="false"/);
    expect(out).toContain("Learn from a post");
    expect(out).toContain("New frame");
    expect(out).not.toContain("COMING LATER");
    expect(out).not.toContain("aria-disabled");
  });

  it("does not open the proposer until asked", () => {
    expect(out).not.toContain("Propose beats");
    expect(out).not.toContain('class="lb-learn"');
  });
});
