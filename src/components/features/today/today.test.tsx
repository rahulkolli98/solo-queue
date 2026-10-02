import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TodaySummary } from "@/lib/today";

const hooks = vi.hoisted(() => ({ drafts: undefined as unknown[] | undefined }));

vi.mock("convex/react", () => ({
  useQuery: () => hooks.drafts,
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

import AlertStack from "./AlertStack";
import FirstRun from "./FirstRun";
import InboxCard from "./InboxCard";
import MetaCard from "./MetaCard";
import PillarCard from "./PillarCard";
import RunwayCard from "./RunwayCard";
import UpNextCard from "./UpNextCard";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const topicId = (id: string) => id as TodaySummary["inbox"]["top"][number]["id"];

const cells = (written: number, open: number, failedAt = -1): string[] =>
  Array.from({ length: 21 }, (_, i) => (i === failedAt ? "failed" : i < written ? "written" : i < written + open ? "open" : "off"));

function summary(over: Partial<TodaySummary> = {}): TodaySummary {
  return {
    tz: "UTC",
    today: "2026-09-25",
    firstRun: false,
    steps: { threadsConnected: true, hasTopic: true, queuedWeek: true },
    upNext: null,
    runway: {
      threads: { cells: cells(20, 1), daysAhead: 20, posts: 22, emptyDays: ["2026-10-15"] },
      instagram: { cells: cells(15, 3, 1), daysAhead: 1, posts: 16, emptyDays: ["2026-10-10"] },
    },
    inbox: { count: 0, top: [] },
    pillarMix: [
      { key: "build", name: "Build in public", color: "pillar-build", target: 40, count: 14, actual: 37 },
      { key: "tools", name: "AI & tools", color: "pillar-tools", target: 30, count: 11, actual: 29 },
    ],
    meta: {
      connections: [
        { platform: "threads", connected: true, handle: "@a", status: "healthy", tokenExpiresAt: 0, tokenDaysLeft: 41, used24h: 3, limit: 250 },
        { platform: "instagram", connected: false },
      ],
      feesThisMonth: 0,
    },
    alerts: [],
    ...over,
  } as TodaySummary;
}

describe("RunwayCard", () => {
  it("shows days written per platform, 21 cells per row and a labelled strip", () => {
    const out = html(<RunwayCard summary={summary()} />);
    expect(out).toContain("20 days");
    expect(out).toContain("of Threads written · 22 posts");
    expect(out.match(/class="sq-t-cell /g)?.length).toBe(42);
    expect(out).toContain("Threads: 20 of 21 days written. First gap Thu 15 Oct.");
    expect(out).toContain("25 SEP → 15 OCT");
    expect(out).toContain("▲ GAP");
    expect(out).toContain('href="/queue"');
  });

  it("marks failed days and the first gap", () => {
    const out = html(<RunwayCard summary={summary()} />);
    expect(out).toContain("sq-t-cell-failed");
    expect(out).toContain("sq-t-cell-gap");
    expect(out).toContain("sq-t-cell-today");
  });

  it("goes quiet on first run", () => {
    const out = html(<RunwayCard summary={summary()} firstRun />);
    expect(out).toContain("NOTHING WRITTEN YET");
    expect(out).toContain("Fills up after step 3");
    expect(out).not.toContain("Open queue");
  });
});

describe("UpNextCard", () => {
  it("shows the post on a note with Edit linking to its drawer and no Post now", () => {
    const upNext = {
      slotId: "slot9",
      platform: "threads" as const,
      scheduledAt: Date.UTC(2026, 8, 25, 12, 14),
      time: "09:30",
      body: "I built a scheduler that charges per post.",
      topicTitle: "t",
    };
    const out = html(<UpNextCard upNext={upNext as TodaySummary["upNext"]} now={Date.UTC(2026, 8, 25, 10, 0)} />);
    expect(out).toContain("in 2h 14m");
    expect(out).toContain("THREADS · 09:30");
    expect(out).toContain('href="/queue?slot=slot9"');
    expect(out).toContain("42 / 500");
    expect(out).not.toContain("Post now");
  });

  it("offers Studio when nothing is scheduled", () => {
    const out = html(<UpNextCard upNext={null} now={0} />);
    expect(out).toContain("NOTHING SCHEDULED");
    expect(out).toContain('href="/studio"');
  });
});

describe("InboxCard", () => {
  it("lists topics with their pillar and source count", () => {
    const inbox = {
      count: 4,
      top: [{ id: topicId("t1"), title: "Threads API rate limits", pillarName: "AI & tools", pillarColor: "pillar-tools", sourceCount: 3, ready: true }],
    };
    const out = html(<InboxCard inbox={inbox} />);
    expect(out).toContain("AI &amp; TOOLS · 3 SOURCES · READY");
    expect(out).toContain('href="/studio/t1"');
    expect(out).toContain("Turn one into posts");
  });

  it("points at Research when empty", () => {
    const out = html(<InboxCard inbox={{ count: 0, top: [] }} />);
    expect(out).toContain("Nothing waiting");
    expect(out).toContain("Add a topic");
  });
});

describe("PillarCard", () => {
  it("shows queued and target bars, counts and an insight", () => {
    const out = html(<PillarCard summary={summary()} />);
    expect(out).toContain("Queued: Build in public 14, AI &amp; tools 11");
    expect(out).toContain("Target: Build in public 40%");
    expect(out).toContain("37% / 40%");
    expect(out).toContain("On target.");
  });
});

describe("MetaCard", () => {
  it("shows tokens, 24 hour usage against limits and the $0 fee line", () => {
    const out = html(<MetaCard meta={summary().meta} />);
    expect(out).toContain("● Healthy");
    expect(out).toContain("REFRESH IN 41 D");
    expect(out).toContain("NOT CONNECTED");
    expect(out).toContain("3 / 250");
    expect(out).toContain("$0");
    expect(out).toContain('href="/log"');
  });

  it("turns rust and offers a reconnect when a token needs the founder", () => {
    const meta = summary().meta;
    const needy = { ...meta, connections: [{ ...meta.connections[0], tokenDaysLeft: 6 }, meta.connections[1]] } as TodaySummary["meta"];
    const out = html(<MetaCard meta={needy} />);
    expect(out).toContain("● Needs you");
    expect(out).toContain("EXPIRES IN 6 D");
    expect(out).toContain("Reconnect Threads");
  });
});

describe("AlertStack", () => {
  const alerts = [
    { id: "failed:s1", kind: "failed", platform: "instagram", slotId: "s1", title: "Instagram post failed · Sat 26 Sep, 12:00.", detail: "Image 2 not reachable." },
    { id: "expiring:threads", kind: "expiring", platform: "threads", title: "Threads token expires in 6 days.", detail: "Reconnect before the slots start failing." },
    { id: "coverage:instagram", kind: "coverage", platform: "instagram", title: "Instagram has 2 days written.", detail: "Empty: Mon 28.", dismissKey: "coverage:instagram:2026-W39" },
  ] as TodaySummary["alerts"];

  it("renders each tone with the board's actions", () => {
    const out = html(<AlertStack alerts={alerts} />);
    expect(out).toContain("sq-banner-coral");
    expect(out).toContain("sq-banner-yellow");
    expect(out).toContain("sq-banner-blue");
    expect(out).toContain('href="/library/media"');
    expect(out).toContain('href="/queue?slot=s1"');
    expect(out).toContain("Reconnect Threads");
    expect(out).toContain('href="/research"');
    expect(out).toContain("Dismiss this week");
  });

  it("renders nothing without alerts", () => {
    expect(html(<AlertStack alerts={[]} />)).toBe("");
  });
});

describe("FirstRun", () => {
  const firstRun = (over: Partial<TodaySummary> = {}) => summary({ firstRun: true, runway: summary().runway, ...over });

  it("starts with Connect Threads when nothing is connected", () => {
    hooks.drafts = undefined;
    const s = firstRun({
      steps: { threadsConnected: false, hasTopic: false, queuedWeek: false },
      meta: { connections: [{ platform: "threads", connected: false }, { platform: "instagram", connected: false }], feesThisMonth: 0 } as TodaySummary["meta"],
    });
    const out = html(<FirstRun summary={s} />);
    expect(out).toContain("Step 1 · now");
    expect(out).toContain("Step 2 · next");
    expect(out).toContain("Step 3 · locked");
    expect(out).toContain("Instagram can wait");
    expect(out).toContain("Connect Instagram");
  });

  it("puts the topic input on the card once Threads is connected", () => {
    hooks.drafts = undefined;
    const s = firstRun({ steps: { threadsConnected: true, hasTopic: false, queuedWeek: false } });
    const out = html(<FirstRun summary={s} />);
    expect(out).toContain("Step 1 · done");
    expect(out).toContain("Step 2 · now");
    expect(out).toContain("Paste a link or a half-thought");
    expect(out).toContain("Save and draft both");
    expect(out).toContain("Posting as <b>@a</b>");
  });

  it("keeps step 3 locked until drafts exist, then unlocks it", () => {
    const topic = { id: topicId("t1"), title: "My topic", pillarName: "Build in public", pillarColor: "pillar-build", sourceCount: 0, ready: false };
    const s = firstRun({ inbox: { count: 1, top: [topic] }, steps: { threadsConnected: true, hasTopic: true, queuedWeek: false } });
    hooks.drafts = [];
    const locked = html(<FirstRun summary={s} />);
    expect(locked).toContain("Step 3 · locked");
    expect(locked).toContain("Draft your first topic");
    hooks.drafts = [{ _id: "d1" }];
    const open = html(<FirstRun summary={s} />);
    expect(open).toContain("Step 3 · now");
    expect(open).toContain("Queue the week");
  });
});
