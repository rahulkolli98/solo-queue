import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined, useAction: () => vi.fn() }));

import BlogPanel from "@/components/features/studio/BlogPanel";
import IgPanel from "@/components/features/studio/IgPanel";
import QueueToggle from "@/components/features/studio/QueueToggle";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import type { Draft, Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };
const missing: Readiness = { state: "missing", overBy: 0, reason: "NOT WRITTEN" };
const media: MediaActions = { busy: null, error: null, clearError: vi.fn(), attach: vi.fn(), verify: vi.fn() };
const view = (body: string): DraftView => ({
  draft: { _id: "d1", templateVersion: 1 } as unknown as Draft,
  body,
  onChange: vi.fn(),
  onBlur: vi.fn(),
});

describe("Generate in each panel", () => {
  it("the Threads column offers Generate beside Write it myself when nothing is written, and Regenerate once there is a thread", () => {
    const empty = html(
      <ThreadsColumn readiness={missing} gen={idle} placeholders={["Hook"]} emptyCopy="x" onGenerate={vi.fn()} />
    );
    expect(empty).toContain("Generate the thread");
    expect(empty).toContain("Write it myself");
    const written = html(
      <ThreadsColumn view={view("One.\n---\nTwo.")} readiness={ready} gen={idle} placeholders={[]} emptyCopy="x" onGenerate={vi.fn()} />
    );
    expect(written).toContain("Regenerate the thread");
    expect(written).not.toContain("Generate the thread");
  });

  it("is disabled while another generation runs", () => {
    const out = html(
      <ThreadsColumn readiness={missing} gen={idle} placeholders={[]} emptyCopy="x" onGenerate={vi.fn()} busy />
    );
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Generate the thread"|<button[^>]*aria-label="Generate the thread"[^>]*disabled=""/);
  });

  it("shows no Generate button when the page does not pass one", () => {
    const out = html(<ThreadsColumn readiness={missing} gen={idle} placeholders={[]} emptyCopy="x" />);
    expect(out).not.toContain("Generate the thread");
  });

  it("the caption and reel panels each have their own", () => {
    const base = { readiness: missing, mediaState: "none" as const, asset: undefined, media, onAttach: vi.fn(), gen: idle, onGenerate: vi.fn() };
    expect(html(<IgPanel kind="caption" {...base} />)).toContain("Generate the caption");
    expect(html(<IgPanel kind="reel" {...base} />)).toContain("Generate the reel script");
    const written = html(<IgPanel kind="reel" {...base} view={view("0:00 hook")} readiness={ready} />);
    expect(written).toContain("Regenerate the reel script");
  });

  it("the reel's waiting text no longer says it starts after the thread", () => {
    const out = html(
      <IgPanel kind="reel" readiness={missing} mediaState="none" asset={undefined} media={media} onAttach={vi.fn()} gen={{ ...idle, writing: true }} />
    );
    expect(out).not.toContain("once the thread is done");
  });

  it("the blog panel can regenerate a written draft", () => {
    const out = html(<BlogPanel view={view("# Post")} topicTitle="T" threadsCount={0} onTab={vi.fn()} gen={idle} onWrite={vi.fn()} writing={false} />);
    expect(out).toContain("Regenerate the blog draft");
  });
});

describe("In this queue", () => {
  it("is on and named after the draft, and says when it is left out", () => {
    const on = html(<QueueToggle included onChange={vi.fn()} what="reel script" />);
    expect(on).toContain("IN THIS QUEUE");
    expect(on).toContain('aria-label="Include the reel script when I press Queue"');
    expect(on).toContain('checked=""');
    const off = html(<QueueToggle included={false} onChange={vi.fn()} what="reel script" />);
    expect(off).toContain("LEFT OUT OF THIS QUEUE");
    expect(off).not.toContain('checked=""');
  });

  it("appears under a written draft, not under an empty panel or a draft that is already queued", () => {
    const toggle = <QueueToggle included onChange={vi.fn()} what="thread" />;
    const written = html(<ThreadsColumn view={view("A.\n---\nB.")} readiness={ready} gen={idle} placeholders={[]} emptyCopy="x" queueToggle={toggle} />);
    expect(written).toContain("IN THIS QUEUE");
    const empty = html(<ThreadsColumn readiness={missing} gen={idle} placeholders={[]} emptyCopy="x" queueToggle={toggle} />);
    expect(empty).not.toContain("IN THIS QUEUE");
    const queued = html(
      <ThreadsColumn view={view("A.\n---\nB.")} readiness={{ state: "queued", overBy: 0, reason: "" }} gen={idle} placeholders={[]} emptyCopy="x" queueToggle={toggle} />
    );
    expect(queued).not.toContain("IN THIS QUEUE");
  });
});
