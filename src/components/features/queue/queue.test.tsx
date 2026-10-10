import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addDays, timelineModel, type BoardCard, type BoardDay } from "@/lib/queueBoard";
import IgTile from "./IgTile";
import OpenSlot, { OpenTile } from "./OpenSlot";
import RangeGrid from "./RangeGrid";
import ReceiptsTable from "./ReceiptsTable";
import StatusChip from "./StatusChip";
import ThreadsCard from "./ThreadsCard";
import Timeline from "./Timeline";
import WeekGrid from "./WeekGrid";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const noop = () => {};

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    _id: "slot1",
    platform: "threads",
    scheduledAt: 0,
    time: "09:30",
    status: "scheduled",
    topicTitle: "Why staking beats streaks",
    snippet: "What staking money taught me.",
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
    key: addDays("2026-09-25", i),
    weekday: (4 + i) % 7,
    label: `FRI ${25 + i}`,
    isToday: i === 0,
    threads: [],
    instagram: [],
    open: { threads: [], instagram: [] },
    ...over,
  };
}

describe("cards", () => {
  it("renders a Threads card in its pillar colour with a status chip and an accessible name", () => {
    const out = html(<ThreadsCard card={card()} onOpen={noop} />);
    expect(out).toContain("var(--color-pillar-tools)");
    expect(out).toContain("SCHEDULED");
    expect(out).toContain("What staking money taught me.");
    expect(out).toContain("Threads post at 09:30, Why staking beats streaks, scheduled. Open details.");
  });

  it("marks failed posts with words and a class, not colour alone", () => {
    const out = html(<ThreadsCard card={card({ status: "failed" })} onOpen={noop} />);
    expect(out).toContain("FAILED");
    expect(out).toContain("sq-q-st-failed");
  });

  it("renders an Instagram tile as a taped, tilted note", () => {
    const out = html(<IgTile card={card({ platform: "instagram", format: "carousel" })} index={1} onOpen={noop} />);
    expect(out).toContain("sq-q-tile-tape");
    expect(out).toContain("rotate(1deg)");
    expect(out).toContain("CAROUSEL");
  });

  it("renders all four statuses", () => {
    for (const s of ["scheduled", "claimed", "published", "failed"] as const) {
      expect(html(<StatusChip status={s} />)).toContain(s.toUpperCase());
    }
  });
});

describe("open slots", () => {
  it("links an open chip to Studio and names the slot", () => {
    const out = html(<OpenSlot platform="threads" time="19:00" dayLabel="Sun 27 Sep" />);
    expect(out).toContain('href="/studio"');
    expect(out).toContain("OPEN · 19:00");
    expect(out).toContain("Open Threads slot, Sun 27 Sep 19:00");
  });

  it("stands one hatched tile in for a whole day of Instagram slots", () => {
    const out = html(<OpenTile times={["12:00", "18:30"]} dayLabel="Mon 28 Sep" />);
    expect(out).toContain("12:00 · 18:30");
    expect(out).toContain("sq-q-tile-blob");
    expect(out).toContain("sq-q-tile-title");
    expect(out).toContain('href="/studio"');
  });
});

describe("WeekGrid", () => {
  const days = [
    day(0, { threads: [card()], instagram: [card({ _id: "ig", platform: "instagram", format: "reel" })], open: { threads: ["19:00"], instagram: [] } }),
    day(1, { open: { threads: ["09:30"], instagram: ["12:00"] } }),
    day(2),
  ];

  it("lays out lanes, day heads and both platforms", () => {
    const out = html(<WeekGrid days={days} platform="both" onOpen={noop} />);
    expect(out).toContain("1 THIS WEEK");
    expect(out).toContain("sq-q-dayhead-today");
    expect(out).toContain("OPEN · 19:00");
    expect(out).toContain("Fill from research");
    expect(out).toContain("NO SLOT");
  });

  it("counts open slots when nothing is filled (empty queue)", () => {
    const empty = [day(0, { open: { threads: ["09:30", "13:00"], instagram: ["12:00"] } }), day(1, { open: { threads: ["09:30"], instagram: [] } })];
    const out = html(<WeekGrid days={empty} platform="both" onOpen={noop} />);
    expect(out).toContain("0 OF 3 FILLED");
    expect(out).toContain("0 OF 1 FILLED");
  });

  it("drops the other platform's lane and cells when filtered", () => {
    const out = html(<WeekGrid days={days} platform="threads" onOpen={noop} />);
    expect(out).not.toContain("sq-q-tile");
    expect(out).not.toContain("sq-q-cell-ig");
    expect(out).toContain("sq-q-cell-threads");
  });
});

describe("RangeGrid", () => {
  it("pads to the first weekday and counts open slots per day", () => {
    const out = html(<RangeGrid days={[day(0, { threads: [card()], open: { threads: ["19:00"], instagram: ["12:00"] } }), day(1)]} platform="both" onOpen={noop} />);
    expect(out.match(/sq-q-range-pad/g)?.length).toBe(4);
    expect(out).toContain("2 OPEN");
    expect(out).toContain("sq-q-compact");
  });
});

describe("Timeline", () => {
  it("reports coverage and the first gap to assistive tech", () => {
    const days = Array.from({ length: 21 }, (_, i) =>
      day(i, i < 5 ? { threads: [card()] } : { open: { threads: ["09:30"], instagram: [] } })
    );
    const model = timelineModel(days, "threads");
    const out = html(<Timeline days={days} model={model} gap={{ day: days[5], platform: "threads", time: "09:30" }} />);
    expect(out).toContain("Covered for 5 days. First gap Wed 30 Sep at 09:30.");
    expect(out).toContain("GAP");
    expect(out).toContain("sq-q-dot-firstgap");
  });
});

describe("ReceiptsTable", () => {
  it("lists attempts newest first with outcome pills", () => {
    const out = html(
      <ReceiptsTable
        tz="UTC"
        receipts={[
          { _id: "b", attemptedAt: Date.UTC(2026, 8, 26, 12, 5), outcome: "permanent", providerMessage: "Image 2: URL not reachable" },
          { _id: "a", attemptedAt: Date.UTC(2026, 8, 26, 12, 0), outcome: "retryable", providerMessage: null },
        ]}
      />
    );
    expect(out.indexOf("PERMANENT")).toBeLessThan(out.indexOf("RETRYABLE"));
    expect(out).toContain("TRY 2");
    expect(out).toContain("TRY 1");
    expect(out).not.toContain("<th");
    expect(out).toContain("sq-q-rfail");
    expect(out).toContain("Image 2: URL not reachable");
  });

  it("says so when there are no attempts", () => {
    expect(html(<ReceiptsTable tz="UTC" receipts={[]} />)).toContain("No attempts yet");
  });
});

describe("at-risk marks", () => {
  const reason = "The Threads connection needs attention. Reconnect before this posts.";
  it("shows AT RISK in words on a card and a tile, with the reason in the name", () => {
    const threads = html(<ThreadsCard card={card({ atRisk: reason })} onOpen={noop} />);
    expect(threads).toContain("AT RISK");
    expect(threads).toContain(`At risk: ${reason}`);
    const ig = html(<IgTile card={card({ platform: "instagram", format: "reel", atRisk: reason })} index={0} onOpen={noop} />);
    expect(ig).toContain("AT RISK");
  });
  it("shows nothing when the post is fine", () => {
    expect(html(<ThreadsCard card={card({ atRisk: null })} onOpen={noop} />)).not.toContain("AT RISK");
    expect(html(<ThreadsCard card={card()} onOpen={noop} />)).not.toContain("AT RISK");
  });
});

describe("WeekGrid for days that went by", () => {
  it("says NO POST (not NO SLOT) for an empty day, and counts what was posted", () => {
    const days = [day(0, { threads: [card({ status: "published" })] }), day(1)];
    const out = html(<WeekGrid days={days} platform="both" past onOpen={noop} />);
    expect(out).toContain("NO POST");
    expect(out).not.toContain("NO SLOT");
    expect(out).toContain("1 POSTED");
    expect(out).toContain("NONE");
    expect(out).not.toContain("FILLED");
  });

  it("keeps the ahead wording for the coming week", () => {
    const out = html(<WeekGrid days={[day(0), day(1)]} platform="both" onOpen={noop} />);
    expect(out).toContain("NO SLOT");
    expect(out).not.toContain("NO POST");
  });
});
