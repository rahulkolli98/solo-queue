"use client";

import { useStableQuery } from "@/lib/useStableQuery";
import Link from "next/link";
import TodaySkeleton from "@/components/skeletons/TodaySkeleton";
import PageHeader from "@/components/ui/PageHeader";
import { PlusIcon } from "@/components/ui/icons";
import { PLATFORM_NAME, longDay, shortDay } from "@/lib/queueBoard";
import {
  coverageOf,
  nextOpenDay,
  todayHeadline,
  weekTag,
  type Platform,
  type TodaySummary,
} from "@/lib/today";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useNow } from "@/lib/useNow";
import { api } from "../../../../convex/_generated/api";
import AlertStack from "./AlertStack";
import FirstRun from "./FirstRun";
import InboxCard from "./InboxCard";
import MetaCard from "./MetaCard";
import PillarCard from "./PillarCard";
import RunwayCard from "./RunwayCard";
import UpNextCard from "./UpNextCard";

function TopBar({ summary, now }: { summary: TodaySummary; now: number }) {
  return (
    <div className="sq-t-top">
      <div className="sq-t-datewrap">
        <span className="t-date">{longDay(summary.today)}</span>
        <span className="sq-tag">{weekTag(now, summary.tz)}</span>
      </div>
      <Link href="/studio" className="sq-btn sq-btn-primary sq-t-new">
        <PlusIcon />
        New from topic
      </Link>
    </div>
  );
}

function CoverageSentence({ summary }: { summary: TodaySummary }) {
  const part = (platform: Platform) => {
    const conn = summary.meta.connections.find((c) => c.platform === platform);
    if (conn && !conn.connected) return <>{PLATFORM_NAME[platform]} is not connected</>;
    const cov = coverageOf(summary.today, summary.runway[platform].daysAhead);
    if (!cov.through) return <>{PLATFORM_NAME[platform]} has nothing written</>;
    if (cov.capped) return <>{PLATFORM_NAME[platform]} is covered for 21+ days</>;
    return (
      <>
        {PLATFORM_NAME[platform]} is covered through <b>{cov.through}</b>
      </>
    );
  };
  const next = nextOpenDay(summary);
  return (
    <>
      {part("threads")}, {part("instagram")}.
      {next && ` Your next open day is ${shortDay(next.key)} on ${PLATFORM_NAME[next.platform]}.`}
    </>
  );
}

function Populated({ summary, now }: { summary: TodaySummary; now: number }) {
  const headline = todayHeadline(summary);
  return (
    <div className="sq-t-page">
      <TopBar summary={summary} now={now} />
      <PageHeader
        headline={
          <>
            {headline.top}
            <br />
            {headline.plain}
            <em>{headline.rust}</em>
          </>
        }
        aside={<CoverageSentence summary={summary} />}
      />
      <AlertStack alerts={summary.alerts} />
      <div className="sq-t-grid">
        <UpNextCard upNext={summary.upNext} now={now} />
        <RunwayCard summary={summary} />
        <InboxCard inbox={summary.inbox} />
        <PillarCard summary={summary} />
        <MetaCard meta={summary.meta} />
      </div>
    </div>
  );
}

/** Today (boards 01, 07a, 07b): the morning glance, live from one reactive query. */
export default function TodayBoard() {
  const now = useNow();
  const tz = useBrowserTz();
  const summary = useStableQuery(api.today.summary, { now, tz });

  if (summary === undefined) return <TodaySkeleton />;
  if (summary.firstRun) {
    return (
      <div className="sq-t-page">
        <TopBar summary={summary} now={now} />
        <PageHeader
          headline={
            <>
              Three steps to
              <br />a week of <em>posts.</em>
            </>
          }
          aside={
            <>
              Connect Threads, save one topic, queue the week. <b>About ten minutes.</b> Instagram can join later.
            </>
          }
        />
        <AlertStack alerts={summary.alerts} />
        <FirstRun summary={summary} />
      </div>
    );
  }
  return <Populated summary={summary} now={now} />;
}
