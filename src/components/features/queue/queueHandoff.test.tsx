import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addDays, type BoardDay } from "@/lib/queueBoard";
import { parseFillSlot } from "@/lib/studioHandoff";
import Agenda from "./Agenda";
import OpenSlot, { OpenTile } from "./OpenSlot";
import RangeGrid from "./RangeGrid";
import WeekGrid from "./WeekGrid";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const noop = () => {};

function day(i: number, over: Partial<BoardDay> = {}): BoardDay {
  return {
    key: addDays("2026-10-03", i),
    weekday: (5 + i) % 7,
    label: `SAT ${3 + i}`,
    isToday: i === 0,
    threads: [],
    instagram: [],
    open: { threads: [], instagram: [] },
    ...over,
  };
}

/** The href of the first link whose markup contains `needle`, decoded. */
function hrefNear(out: string, needle: string): string {
  const at = out.indexOf(needle);
  const start = out.lastIndexOf("<a ", at);
  const href = /href="([^"]+)"/.exec(out.slice(start, at))?.[1] ?? "";
  return href.replace(/&amp;/g, "&");
}

describe("open slot -> Studio hand-off links", () => {
  it("an open Threads card names its day, time and platform in the Studio link", () => {
    const out = html(<OpenSlot platform="threads" time="09:30" dayLabel="Sat 3 Oct" dayKey="2026-10-03" />);
    const href = hrefNear(out, "OPEN · 09:30");
    expect(href.startsWith("/studio?")).toBe(true);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseFillSlot(params)).toEqual({ dayKey: "2026-10-03", time: "09:30", platform: "threads" });
  });

  it("the Instagram open tile carries its first time", () => {
    const out = html(<OpenTile times={["12:00", "18:30"]} dayLabel="Sat 3 Oct" dayKey="2026-10-03" />);
    const params = Object.fromEntries(new URL(hrefNear(out, "OPEN"), "http://x").searchParams);
    expect(parseFillSlot(params)).toEqual({ dayKey: "2026-10-03", time: "12:00", platform: "instagram" });
  });

  it("without a day key it still links to plain Studio", () => {
    expect(html(<OpenSlot platform="threads" time="09:30" dayLabel="Sat 3 Oct" />)).toContain('href="/studio"');
  });

  it("the week grid passes each day's key down", () => {
    const out = html(<WeekGrid days={[day(0, { open: { threads: ["09:30"], instagram: [] } })]} platform="both" onOpen={noop} />);
    expect(out).toContain("fillDay=2026-10-03");
    expect(out).toContain("fillOn=threads");
  });

  it("the 3-week view links a day's open chip to that day", () => {
    const out = html(<RangeGrid days={[day(0, { open: { threads: ["09:30"], instagram: ["12:00"] } })]} platform="both" onOpen={noop} />);
    expect(out).toContain("2 OPEN");
    expect(out).toContain("fillDay=2026-10-03");
  });

  it("the phone agenda links each open row to its day, time and platform", () => {
    const out = html(
      <Agenda days={[day(0, { open: { threads: ["09:30"], instagram: [] } })]} platform="both" pillarNames={{}} empty={false} onOpen={noop} />
    );
    const params = Object.fromEntries(new URL(hrefNear(out, "Open slot"), "http://x").searchParams);
    expect(parseFillSlot(params)).toEqual({ dayKey: "2026-10-03", time: "09:30", platform: "threads" });
  });
});
