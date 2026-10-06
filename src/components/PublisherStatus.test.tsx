import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { publisherStatusView, type PublisherHold } from "@/lib/publisherStatus";

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

describe("publisherStatusView holds", () => {
  const until = Date.UTC(2026, 9, 12, 20, 0); // Mon 12 Oct 2026, 20:00 UTC
  const vacation: PublisherHold = { reason: "vacation", until };

  it("says plainly that the queue is on vacation and until which day", () => {
    const view = publisherStatusView({ mode: "live", paused: false, hold: vacation, tz: "UTC" });
    expect(view).toMatchObject({ label: "ON HOLD", tone: "hold" });
    expect(view.hint).toBe("On vacation until Mon 12 Oct.");
  });

  it("words the day in the founder's zone", () => {
    // 20:00 UTC is already Tuesday 13 Oct in Kolkata.
    expect(publisherStatusView({ mode: "live", paused: false, hold: vacation, tz: "Asia/Kolkata" }).hint).toBe(
      "On vacation until Tue 13 Oct."
    );
  });

  it("says a failed post is holding the queue and what to do", () => {
    const view = publisherStatusView({ mode: "dry-run", paused: false, hold: { reason: "failure" } });
    expect(view).toMatchObject({ label: "ON HOLD", tone: "hold", hint: "Held: a post failed. Retry or cancel it." });
  });

  it("lets a manual pause win, and no hold leaves dry run and live as they were", () => {
    expect(publisherStatusView({ mode: "live", paused: true, hold: vacation }).label).toBe("PAUSED");
    expect(publisherStatusView({ mode: "live", paused: false, hold: null }).label).toBe("LIVE");
    expect(publisherStatusView({ mode: "dry-run", paused: false }).label).toBe("DRY RUN");
  });
});

const state: {
  value: { mode: "dry-run" | "live"; paused: boolean; hold?: PublisherHold | null; tz?: string } | undefined;
} = { value: undefined };
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

  it("shows why nothing is posting when the queue is on hold", () => {
    state.value = { mode: "live", paused: false, hold: { reason: "failure" }, tz: "UTC" };
    const full = renderToStaticMarkup(<PublisherStatus />);
    expect(full).toContain("ON HOLD");
    expect(full).toContain('data-tone="hold"');
    expect(full).toContain("Held: a post failed. Retry or cancel it.");
    state.value = { mode: "live", paused: false, hold: { reason: "vacation", until: Date.UTC(2026, 9, 12, 8, 0) }, tz: "UTC" };
    expect(renderToStaticMarkup(<PublisherStatus compact />)).toContain("ON HOLD");
    expect(renderToStaticMarkup(<PublisherStatus />)).toContain("On vacation until Mon 12 Oct.");
  });
});
