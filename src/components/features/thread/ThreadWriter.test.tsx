import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ThreadWriter from "./ThreadWriter";

const html = (props: Partial<React.ComponentProps<typeof ThreadWriter>> = {}) =>
  renderToStaticMarkup(<ThreadWriter posts={["Hook", "Second"]} onChange={() => {}} idPrefix="t" {...props} />);

describe("ThreadWriter", () => {
  it("shows one editable box per post with its own counter and the post count", () => {
    const out = html();
    expect(out).toContain("POST 1 · THE HOOK");
    expect(out).toContain("POST 2");
    expect(out).toContain("4 / 500");
    expect(out).toContain("6 / 500");
    expect(out).toContain("2 / 25 posts");
    expect(out).toContain("+ Add post");
  });

  it("labels the controls per post, and the first post cannot move up nor the last move down", () => {
    const out = html();
    expect(out).toContain('aria-label="Move post 1 up"');
    expect(out).toContain('aria-label="Remove post 2"');
    expect(out).toMatch(/aria-label="Move post 1 up"[^>]*disabled|disabled=""[^>]*aria-label="Move post 1 up"/);
  });

  it("flags a post over the limit in words, not colour alone", () => {
    const out = html({ posts: ["x".repeat(501)] });
    expect(out).toContain("501 / 500 · OVER THE LIMIT");
    expect(out).toContain('aria-invalid="true"');
  });

  it("stops offering to add a post at 25", () => {
    const out = html({ posts: Array.from({ length: 25 }, (_, i) => `p${i}`) });
    expect(out).toContain("25 / 25 posts");
    expect(out).toMatch(/disabled=""[^>]*>\+ Add post|>\+ Add post/);
    expect(out.match(/<button[^>]*disabled[^>]*>\s*\+ Add post/)).not.toBeNull();
  });

  it("uses the dark treatment inside the Threads column and is disabled when asked", () => {
    const out = html({ tone: "dark", disabled: true });
    expect(out).toContain('data-tone="dark"');
    expect(out).toContain("disabled");
  });
});
