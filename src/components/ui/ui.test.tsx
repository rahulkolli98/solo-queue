import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Banner from "@/components/ui/Banner";
import Skeleton, { LoadingRegion } from "@/components/ui/Skeleton";
import NotFound from "@/app/not-found";
import TodaySkeleton from "@/components/skeletons/TodaySkeleton";
import StudioSkeleton from "@/components/skeletons/StudioSkeleton";
import QueueSkeleton from "@/components/skeletons/QueueSkeleton";
import ResearchSkeleton from "@/components/skeletons/ResearchSkeleton";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Banner", () => {
  it("renders all three tones with the right class", () => {
    for (const tone of ["coral", "yellow", "blue"] as const) {
      const out = html(<Banner tone={tone} title="Heads up." />);
      expect(out).toContain(`sq-banner-${tone}`);
      expect(out).toContain("Heads up.");
    }
  });

  it("announces failures as alerts and the other tones politely", () => {
    expect(html(<Banner tone="coral" title="x" />)).toContain('role="alert"');
    expect(html(<Banner tone="yellow" title="x" />)).toContain('role="status"');
    expect(html(<Banner tone="blue" title="x" />)).toContain('role="status"');
  });

  it("shows the detail after the title and renders at most two actions", () => {
    const out = html(
      <Banner
        tone="coral"
        title="Instagram post failed."
        detail="Media URL not reachable."
        actions={[
          { label: "Replace media", variant: "secondary" },
          { label: "Reschedule", variant: "primary" },
          { label: "Third", variant: "secondary" },
        ]}
      />
    );
    expect(out).toContain("Media URL not reachable.");
    expect(out).toContain("Replace media");
    expect(out).toContain("Reschedule");
    expect(out).not.toContain("Third");
  });

  it("renders an action with an href as a link and without as a button", () => {
    const out = html(
      <Banner
        tone="blue"
        title="x"
        actions={[{ label: "Fill from research", href: "/studio" }, { label: "Dismiss" }]}
      />
    );
    expect(out).toContain('href="/studio"');
    expect(out).toMatch(/<button[^>]*>Dismiss<\/button>/);
  });
});

describe("Skeleton", () => {
  it("is decorative, sized and tinted by props", () => {
    const out = html(<Skeleton w={62} h={12} r={6} tone="dark" rot={-2} />);
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("sq-sk-dk");
    expect(out).toContain("width:62px");
    expect(out).toContain("height:12px");
    expect(out).toContain("border-radius:6px");
    expect(out).toContain("rotate(-2deg)");
  });

  it("LoadingRegion is busy and announces one status line", () => {
    const out = html(
      <LoadingRegion label="Loading Today…">
        <Skeleton />
      </LoadingRegion>
    );
    expect(out).toContain('aria-busy="true"');
    expect(out).toMatch(/role="status"[^>]*>Loading Today…</);
  });
});

describe("loading screens (boards 08a to 08e)", () => {
  const cases: [string, React.ReactElement, string][] = [
    ["Today", <TodaySkeleton key="t" />, "Loading Today…"],
    ["Studio", <StudioSkeleton key="s" />, "Loading Studio…"],
    ["Queue", <QueueSkeleton key="q" />, "Loading the queue…"],
    ["Research", <ResearchSkeleton key="r" />, "Loading research…"],
    ["Library", <LibrarySkeleton key="l" />, "Loading the library…"],
    ["Settings", <SettingsSkeleton key="x" />, "Loading settings…"],
  ];

  it.each(cases)("%s shows its own skeleton, not a spinner", (_name, node, label) => {
    const out = html(node);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain(label);
    expect((out.match(/class="sq-sk/g) ?? []).length).toBeGreaterThan(10);
    expect(out.toLowerCase()).not.toContain("spinner");
  });

  it("Today draws two runway rows", () => {
    const out = html(<TodaySkeleton />);
    expect(out.match(/class="sq-skel-runway"/g)).toHaveLength(2);
  });

  it("Queue draws seven day columns", () => {
    const out = html(<QueueSkeleton />);
    const days = out.split('class="sq-skel-days"')[1] ?? "";
    expect((days.match(/height:48px;border-radius:16px/g) ?? []).length).toBe(7);
  });
});

describe("404 (board 07m)", () => {
  it("is the empty-slot composition with both exits", () => {
    const out = html(<NotFound />);
    expect(out).toContain('aria-label="404"');
    expect(out).toContain("This slot is");
    expect(out).toContain("empty.");
    expect(out).toContain('href="/"');
    expect(out).toContain("Back to Today");
    expect(out).toContain('href="/queue"');
    expect(out).toContain("Open the queue");
  });
});
