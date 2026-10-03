import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { publisherStatusView } from "@/lib/publisherStatus";

describe("publisherStatusView", () => {
  it("says plainly that a dry run posts nothing", () => {
    expect(publisherStatusView({ mode: "dry-run", paused: false })).toMatchObject({ label: "DRY RUN", tone: "dry" });
    expect(publisherStatusView({ mode: "dry-run", paused: false }).hint).toMatch(/Nothing is posted/);
  });

  it("says live posts go out, and a pause beats both", () => {
    expect(publisherStatusView({ mode: "live", paused: false })).toMatchObject({ label: "LIVE", tone: "live" });
    expect(publisherStatusView({ mode: "live", paused: true })).toMatchObject({ label: "PAUSED", tone: "paused" });
    expect(publisherStatusView({ mode: "dry-run", paused: true }).label).toBe("PAUSED");
  });
});

const state: { value: { mode: "dry-run" | "live"; paused: boolean } | undefined } = { value: undefined };
vi.mock("convex/react", () => ({ useQuery: () => state.value }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PublisherStatus from "@/components/PublisherStatus";

describe("PublisherStatus", () => {
  it("renders nothing until the mode is known", () => {
    state.value = undefined;
    expect(renderToStaticMarkup(<PublisherStatus />)).toBe("");
  });

  it("links to the publishing log with the state in words, and has a compact form", () => {
    state.value = { mode: "dry-run", paused: false };
    const full = renderToStaticMarkup(<PublisherStatus />);
    expect(full).toContain('href="/log"');
    expect(full).toContain("DRY RUN");
    expect(full).toContain("Nothing is posted yet");
    const compact = renderToStaticMarkup(<PublisherStatus compact />);
    expect(compact).toContain("DRY RUN");
    expect(compact).not.toContain("sq-publisher-hint");
  });
});
