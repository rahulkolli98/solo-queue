import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TopicBoard from "./TopicBoard";
import type { BoardTopic } from "./types";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const topic = {
  _id: "t1",
  _creationTime: 0,
  title: "Threads API rate limits",
  status: "drafting",
  createdAt: 0,
  sourceCount: 3,
  ready: true,
  needsMore: 0,
} as BoardTopic;

describe("TopicBoard: make a story frame", () => {
  const out = renderToStaticMarkup(<TopicBoard topic={topic} frames={[]} pillars={[]} onEdit={() => {}} />);

  it("has one quiet button, collapsed by default", () => {
    expect(out).toContain("Make a story frame from this topic or a post");
    expect(out).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Make a story frame from this topic or a post<\/button>/);
    expect(out).not.toContain("class=\"rs-frame-panel\"");
    expect(out).not.toContain("Propose beats");
  });

  it("sits below the angles row and above Your thread", () => {
    const angles = out.indexOf("Angles to try");
    const frame = out.indexOf("Make a story frame from this topic or a post");
    const thread = out.indexOf('class="rs-thread');
    expect(angles).toBeGreaterThan(-1);
    expect(thread).toBeGreaterThan(-1);
    expect(frame).toBeGreaterThan(angles);
    expect(frame).toBeLessThan(thread);
  });
});
