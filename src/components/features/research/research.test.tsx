import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EmptyBoard from "./EmptyBoard";
import TopicRail from "./TopicRail";
import type { BoardTopic, Pillar } from "./types";

const pillars: Pillar[] = [
  { key: "build", name: "Build in public", color: "pillar-build", description: "", targetShare: 40, links: [] },
  { key: "tools", name: "AI & tools", color: "pillar-tools", description: "", targetShare: 30, links: [] },
];
const NOW = 1_000_000_000_000;

function topic(over: Partial<BoardTopic>): BoardTopic {
  return {
    _id: "t1",
    _creationTime: NOW,
    title: "Threads API rate limits",
    status: "drafting",
    createdAt: NOW - 2 * 86_400_000,
    sourceCount: 3,
    ready: true,
    needsMore: 0,
    pillar: "tools",
    ...over,
  } as BoardTopic;
}

function rail(props: Partial<Parameters<typeof TopicRail>[0]>) {
  return renderToStaticMarkup(
    <TopicRail
      active={[]}
      sent={[]}
      activeTotal={0}
      pillars={pillars}
      pillarFilter={null}
      onFilter={() => {}}
      selectedId={null}
      onSelect={() => {}}
      onNew={() => {}}
      now={NOW}
      {...props}
    />
  );
}

describe("TopicRail", () => {
  it("shows pillar chips with the All count", () => {
    const out = rail({ activeTotal: 4 });
    expect(out).toContain("All · 4");
    expect(out).toContain("Build in public");
    expect(out).toContain("AI &amp; tools");
  });
  it("marks a ready row and the selected row", () => {
    const out = rail({ active: [topic({})], activeTotal: 1, selectedId: "t1" });
    expect(out).toContain("READY");
    // "SAVED " is a desktop-only span: phones read "3 SOURCES · 2 D AGO" (board MResearch)
    expect(out).toContain('3 SOURCES · <span class="rs-long">SAVED </span>2 D AGO');
    expect(out).toContain('aria-pressed="true"');
  });
  it("says how many sources a topic still needs", () => {
    const out = rail({
      active: [topic({ ready: false, needsMore: 2, sourceCount: 0, pillar: undefined })],
      activeTotal: 1,
    });
    expect(out).toContain("NEEDS 2 MORE");
    expect(out).toContain("No pillar yet");
  });
  it("lists sent topics struck through in the dashed box", () => {
    const out = rail({ sent: [topic({ _id: "s1" as BoardTopic["_id"], title: "Per-post fees", status: "done" })], activeTotal: 1, active: [topic({})] });
    expect(out).toContain("SENT TO STUDIO · 1");
    expect(out).toContain("Per-post fees");
    expect(out).toContain("rs-sent-btn");
  });
  it("invites the first capture when the inbox is empty", () => {
    const out = rail({});
    expect(out).toContain("No topics yet");
    expect(out).not.toContain("+ New topic");
  });
});

describe("EmptyBoard", () => {
  it("shows the three example notes", () => {
    const out = renderToStaticMarkup(<EmptyBoard />);
    expect(out).toContain("01 · A LINK");
    expect(out).toContain("02 · A THOUGHT");
    expect(out).toContain("03 · A BUILD MOMENT");
    expect(out).toContain("Your first topic board lands here");
  });
});
