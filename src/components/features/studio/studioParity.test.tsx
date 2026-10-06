import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined, useAction: () => vi.fn() }));

import BlogPanel from "@/components/features/studio/BlogPanel";
import BlogPreview from "@/components/features/studio/BlogPreview";
import InstagramColumn from "@/components/features/studio/InstagramColumn";
import PlatformNotice from "@/components/features/studio/PlatformNotice";
import { PostsControl, StudioToolbar } from "@/components/features/studio/StudioActions";
import type { IgPanelProps } from "@/components/features/studio/IgPanel";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { Draft, Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };

function view(body: string): DraftView {
  return {
    draft: { _id: "d1", templateVersion: 1 } as unknown as Draft,
    body,
    onChange: vi.fn(),
    onBlur: vi.fn(),
  };
}

const BLOG = "1. Option A\n2. Option B\n\nThe lede with **bold** and a [link](https://x.test).\n\n## The setup\nBody text.";

function blog(extra: Partial<React.ComponentProps<typeof BlogPanel>> = {}) {
  return html(
    <BlogPanel
      view={view(BLOG)}
      topicTitle="T"
      threadsCount={4}
      onTab={vi.fn()}
      gen={idle}
      writing={false}
      onWrite={vi.fn()}
      {...extra}
    />
  );
}

describe("blog draft preview", () => {
  it("opens on the article, not the raw markdown, with Edit and Preview to switch", () => {
    const out = blog();
    expect(out).toContain("<h3");
    expect(out).toContain("The setup");
    expect(out).not.toContain("## The setup");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<ol");
    expect(out).not.toContain("<textarea");
    expect(out).toContain("Preview");
    expect(out).toMatch(/aria-pressed="false"[^>]*>Edit/);
  });

  it("shows the markdown text in the editable box when Edit is chosen, untouched", () => {
    const out = blog({ defaultEditing: true });
    expect(out).toContain("<textarea");
    expect(out).toContain("## The setup");
    expect(out).not.toContain("studio-md-h");
  });

  it("opens an empty draft straight on the text box", () => {
    expect(blog({ view: view("   ") })).toContain("<textarea");
  });

  it("marks the card's own tab strip so a phone can hide it (the pane switch stays)", () => {
    expect(blog()).toContain("studio-blog-tabs");
  });

  it("never turns draft text into HTML", () => {
    const out = html(<BlogPreview body={'<img src=x onerror="alert(1)"> and [a](javascript:alert(1))'} />);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(out).not.toContain("href");
    expect(out).not.toContain("javascript:alert");
  });
});

describe("platform notice, switch ring and Instagram footer", () => {
  it("says which platform needs you and offers to open it", () => {
    const out = html(<PlatformNotice platform="Instagram" count={2} onOpen={vi.fn()} />);
    expect(out).toContain("Instagram: 2 drafts need you");
    expect(out).toContain('aria-label="Open Instagram"');
  });

  it("flags the platform switch segments through data attributes", () => {
    const base = {
      saveText: "",
      saveFailed: false,
      onRetrySave: vi.fn(),
      pane: "threads" as const,
      onPane: vi.fn(),
      counts: { threads: 4, instagram: 2 },
    };
    expect(html(<StudioToolbar {...base} attention={{ instagram: true }} />)).toContain("data-attention-instagram");
    expect(html(<StudioToolbar {...base} />)).not.toContain("data-attention");
  });

  const igProps = (kind: "reel" | "caption"): IgPanelProps => ({
    kind,
    view: undefined,
    readiness: ready,
    mediaState: "none",
    asset: undefined,
    media: { busy: null, error: null, clearError: vi.fn(), attach: vi.fn(), verify: vi.fn() },
    onAttach: vi.fn(),
    gen: idle,
  });

  it("adds the 'N INSTAGRAM DRAFTS NEED YOU' footer only when Instagram drafts have problems", () => {
    const props = {
      tab: "reel" as const,
      onTab: vi.fn(),
      panels: { reel: igProps("reel"), caption: igProps("caption") },
      draftCount: 2,
    };
    expect(html(<InstagramColumn {...props} needCount={2} />)).toContain("2 INSTAGRAM DRAFTS NEED YOU");
    expect(html(<InstagramColumn {...props} />)).not.toContain("NEED YOU");
  });
});

describe("Posts control on a phone", () => {
  it("keeps the helper line and the default link, behind a More button that starts closed", () => {
    const out = html(<PostsControl value={5} steps={4} disabled={false} onChange={vi.fn()} onMakeDefault={vi.fn()} />);
    expect(out).toContain("More");
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain("Make 5 my default");
    expect(out).toContain("A story frame has 4 steps");
    expect(out).not.toContain("data-open");
  });
});
