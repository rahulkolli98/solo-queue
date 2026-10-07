import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined }));

import { addDays, type BoardCard, type BoardDay } from "@/lib/queueBoard";
import Agenda from "./Agenda";
import AtRiskMark, { AtRiskNote } from "./AtRiskMark";
import IgTile from "./IgTile";
import RangeGrid from "./RangeGrid";
import SlotActions from "./SlotActions";
import SlotDetailBody, { type SlotDetail } from "./SlotDetailBody";
import StatusChip from "./StatusChip";
import ThreadsCard from "./ThreadsCard";
import WeekGrid from "./WeekGrid";
import type { useSlotActions } from "./useSlotActions";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const noop = () => {};

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    _id: "slot1",
    platform: "threads",
    scheduledAt: 0,
    time: "19:00",
    status: "scheduled",
    topicTitle: "Why staking money beats streaks",
    snippet: "What staking taught me.",
    constraintOk: true,
    pillarColor: "pillar-tools",
    format: null,
    hasMedia: false,
    attempts: 0,
    lastError: null,
    ...over,
  };
}

function day(i: number, over: Partial<BoardDay> = {}): BoardDay {
  return {
    key: addDays("2026-10-06", i),
    weekday: (1 + i) % 7,
    label: `TUE ${6 + i}`,
    isToday: i === 0,
    threads: [],
    instagram: [],
    open: { threads: [], instagram: [] },
    ...over,
  };
}

describe("slot cards carry day, time, platform and status in their name", () => {
  it("a Threads card in the week grid names its day", () => {
    const out = html(<WeekGrid days={[day(0, { threads: [card()] })]} platform="both" onOpen={noop} />);
    expect(out).toContain('aria-label="Threads post on Tue 6 Oct at 19:00, Why staking money beats streaks, scheduled. Open details."');
    expect(out).toContain('data-slot-id="slot1"');
  });

  it("an Instagram tile and a compact range chip name the day and the status too", () => {
    const ig = card({ _id: "ig1", platform: "instagram", format: "reel", status: "failed", time: "12:00" });
    expect(html(<IgTile card={ig} index={0} dayLabel="Wed 7 Oct" onOpen={noop} />)).toContain(
      'aria-label="Instagram reel on Wed 7 Oct at 12:00, Why staking money beats streaks, failed. Open details."'
    );
    const out = html(<RangeGrid days={[day(1, { instagram: [ig] })]} platform="both" onOpen={noop} />);
    expect(out).toContain('aria-label="Instagram reel on Wed 7 Oct at 12:00, Why staking money beats streaks, failed. Open details."');
  });

  it("the phone agenda names the day on its cards and open slots, and says what each day pill means in words", () => {
    const days = [day(0, { threads: [card()] }), day(1, { open: { threads: ["09:30"], instagram: [] } }), day(2)];
    const out = html(<Agenda days={days} platform="both" pillarNames={{}} empty={false} onOpen={noop} />);
    expect(out).toContain("Threads post on Tue 6 Oct at 19:00");
    expect(out).toContain('aria-label="Tuesday 6, written"');
    expect(out).toContain('aria-label="Wednesday 7, has open slots"');
    expect(out).toContain('aria-label="Thursday 8, no posting slots"');
    const open = html(<Agenda days={[day(1, { open: { threads: ["09:30"], instagram: [] } })]} platform="both" pillarNames={{}} empty={false} onOpen={noop} />);
    expect(open).toContain("Open Threads slot, Wed 7 Oct 09:30.");
  });
});

describe("day cells are named groups", () => {
  it("each week column is a group named by its day, today and what it holds", () => {
    const days = [day(0, { threads: [card()], open: { threads: ["09:30"], instagram: [] } }), day(1)];
    const out = html(<WeekGrid days={days} platform="both" onOpen={noop} />);
    expect(out).toContain('role="group" aria-label="Tue 6 Oct, today. 1 post, 1 open slot."');
    expect(out).toContain('aria-label="Wed 7 Oct. No slot."');
  });
  it("each calendar day in the 3-week and month views is a group too", () => {
    const out = html(<RangeGrid days={[day(0, { threads: [card({ status: "failed" })] }), day(1)]} platform="both" onOpen={noop} />);
    expect(out).toContain('role="group" aria-label="Tue 6 Oct, today. 1 post, 1 failed."');
    expect(out).toContain('aria-label="Wed 7 Oct. No slot."');
  });
});

describe("status is an icon and a word, never colour alone", () => {
  it("every status chip has a hidden icon beside its word", () => {
    for (const s of ["scheduled", "claimed", "published", "failed"] as const) {
      const out = html(<StatusChip status={s} />);
      expect(out).toContain('class="sq-q-statusicon" aria-hidden="true"');
      expect(out).toContain("<svg");
      expect(out).toContain(s.toUpperCase());
    }
  });
  it("the at-risk mark and note carry an icon and the words AT RISK", () => {
    const mark = html(<AtRiskMark reason="Reconnect Threads." />);
    expect(mark).toContain("<svg");
    expect(mark).toContain("AT RISK");
    const note = html(<AtRiskNote reason="Reconnect Threads." />);
    expect(note).toContain("<svg");
    expect(note).toContain('role="status"');
  });
  it("a Threads card shows the icon inside its chip", () => {
    expect(html(<ThreadsCard card={card({ status: "published" })} onOpen={noop} />)).toContain("sq-q-statusicon");
  });
});

const detail = (status: SlotDetail["slot"]["status"], constraintOk = true): SlotDetail => ({
  slot: { _id: "slot1", status, platform: "threads", scheduledAt: 0, attempts: 0 },
  draft: { body: "Hello", format: "thread", constraintOk },
  topic: { title: "Why staking money beats streaks" },
  media: null,
  receipts: [],
});

function actions(over: Partial<ReturnType<typeof useSlotActions>> = {}): ReturnType<typeof useSlotActions> {
  return {
    when: "2026-10-06T19:00",
    setWhen: noop,
    busy: null,
    error: null,
    armed: false,
    retry: async () => {},
    reschedule: async () => {},
    requeue: async () => {},
    cancel: () => Promise.resolve(),
    ...over,
  };
}

describe("the slot sheet reads its status", () => {
  it("shows the status pill as an icon and a word, and the over-limit pill as an icon and a word", () => {
    const out = html(<SlotDetailBody detail={detail("failed", false)} tz="UTC" actions={actions()} />);
    expect(out).toMatch(/sq-pill sq-pill-bad">\s*<span class="sq-q-statusicon"[^>]*>[\s\S]*?<\/span>FAILED/);
    expect(out).toMatch(/<\/span>OVER LIMIT/);
  });
});

describe("the two-step Cancel announces itself", () => {
  it("has a standing status region that is empty until armed, and says what happens next once armed", () => {
    const idle = html(<SlotActions detail={detail("scheduled")} actions={actions()} />);
    expect(idle).toMatch(/<span class="sq-sr" role="status"><\/span>/);
    expect(idle).toContain("Cancel post");
    expect(idle).not.toContain('aria-live="polite"');
    const armed = html(<SlotActions detail={detail("scheduled")} actions={actions({ armed: true })} />);
    expect(armed).toContain("Press Cancel post again within 5 seconds to cancel this post. The draft is kept.");
    expect(armed).toContain("Tap again to cancel");
  });
  it("offers no Cancel for a published or claimed post", () => {
    expect(html(<SlotActions detail={detail("published")} actions={actions()} />)).not.toContain("Cancel post");
    expect(html(<SlotActions detail={detail("claimed")} actions={actions()} />)).not.toContain("Cancel post");
  });
});

describe("a carousel post in the queue", () => {
  it("the tile says CAROUSEL and its accessible name gives the slide count", () => {
    const c = card({ platform: "instagram", format: "carousel", slideCount: 6 });
    const out = html(<IgTile card={c} index={0} onOpen={noop} />);
    expect(out).toContain("CAROUSEL");
    expect(out).toContain("Instagram carousel of 6 slides at");
  });

  it("the sheet shows every slide image in order with its own alt text, and a removed one as gone", () => {
    const d = {
      ...detail("scheduled"),
      slideMedia: [
        { _id: "a", publicUrl: "https://x.test/1.png", fileRemoved: false },
        { _id: "b", publicUrl: "https://x.test/2.png", fileRemoved: false },
        { _id: "c", publicUrl: "https://x.test/3.png", fileRemoved: true },
      ],
    };
    const out = html(<SlotDetailBody detail={d} tz="UTC" actions={actions()} />);
    expect(out).toContain('aria-label="Carousel slides, 3"');
    expect(out).toContain('alt="Slide 1 of 3"');
    expect(out).toContain('alt="Slide 2 of 3"');
    expect(out.indexOf("1.png")).toBeLessThan(out.indexOf("2.png"));
    expect(out).toContain("GONE");
    expect(out).not.toContain('alt="Slide 3 of 3"');
  });

  it("a post with one image (or none) keeps the single preview", () => {
    const out = html(<SlotDetailBody detail={{ ...detail("scheduled"), slideMedia: [] }} tz="UTC" actions={actions()} />);
    expect(out).not.toContain("sq-q-slides");
  });
});
