import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeartbeatCard, UsageCard } from "@/components/features/log/LogCards";
import PlatformMark from "@/components/features/log/PlatformMark";
import ReceiptsTable, { type Attempt } from "@/components/features/log/ReceiptsTable";

const NOW = Date.UTC(2026, 9, 2, 8, 0);

function attempt(over: Partial<Attempt>): Attempt {
  return {
    _id: "r1",
    attemptedAt: NOW - 60_000,
    outcome: "success",
    providerMessage: null,
    slotId: "s1",
    attempt: 1,
    platform: "threads",
    topicTitle: "Five hooks",
    snippet: "",
    ...over,
  };
}

describe("PlatformMark", () => {
  it("draws Threads as an @ and Instagram as the board's rounded-square glyph, never the old text box", () => {
    const threads = renderToStaticMarkup(<PlatformMark platform="threads" />);
    expect(threads).toContain("sq-avatar-threads");
    expect(threads).toContain("@");

    const ig = renderToStaticMarkup(<PlatformMark platform="instagram" />);
    expect(ig).toContain("sq-avatar-ig");
    expect(ig).toContain("<svg");
    expect(ig).toContain('rx="5"');
    expect(ig).not.toContain("\u25a2");
  });

  it("names the platform only when asked to", () => {
    expect(renderToStaticMarkup(<PlatformMark platform="instagram" label />)).toContain('aria-label="Instagram"');
    expect(renderToStaticMarkup(<PlatformMark platform="instagram" />)).toContain('aria-hidden="true"');
  });
});

describe("ReceiptsTable", () => {
  const html = (attempts: Attempt[]) => renderToStaticMarkup(<ReceiptsTable attempts={attempts} now={NOW} tz="UTC" />);

  it("has a TRY column and shows each attempt's number on the desktop table and the phone card", () => {
    const out = html([attempt({ _id: "a", attempt: 2 }), attempt({ _id: "b", attempt: 1 })]);
    expect(out).toContain('<th scope="col">Try</th>');
    expect(out).toContain("#2");
    expect(out).toContain("#1");
    expect(out).toContain("· TRY 2");
    expect(out).toContain("· TRY 1");
  });

  it("gives every attempt its own tbody (the phone card) and marks a permanent failure", () => {
    const out = html([
      attempt({ _id: "a", outcome: "permanent", providerMessage: "Image 2: media URL not reachable", platform: "instagram" }),
      attempt({ _id: "b" }),
    ]);
    expect(out.match(/<tbody/g)).toHaveLength(2);
    expect(out).toContain("sq-log-rec sq-log-rec-bad");
    expect(out).toContain("PROVIDER · Image 2: media URL not reachable");
    expect(out).toContain("NEXT · Replace the media");
    expect(out).toContain('aria-label="Instagram"');
  });

  it("says so when nothing has been attempted", () => {
    expect(html([])).toContain("No attempts yet");
  });
});

describe("LogCards", () => {
  it("promises the alarm after 5 minutes of silence", () => {
    const out = renderToStaticMarkup(<HeartbeatCard heartbeat={{ ageSeconds: 42, stale: false }} mode="live" />);
    expect(out).toContain("Alarm after 5 minutes of silence.");
    expect(out).toContain("42s ago");
  });

  it("gives the usage card the phone board's two short lines beside the meters", () => {
    const out = renderToStaticMarkup(
      <UsageCard used={{ threads: 3, instagram: 2 }} limits={{ threads: 250, instagram: 100 }} />
    );
    expect(out).toContain("TH 3 / 250");
    expect(out).toContain("IG 2 / 100");
    expect(out).toContain("Last 24 hours");
    expect(out).toContain('role="meter"');
  });
});
