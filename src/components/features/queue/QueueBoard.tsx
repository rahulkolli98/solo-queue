"use client";

import { useQuery } from "convex/react";
import { useStableQuery } from "@/lib/useStableQuery";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import QueueSkeleton from "@/components/skeletons/QueueSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { ArrowRightIcon, PlusIcon, SettingsIcon } from "@/components/ui/icons";
import { useNavCounts } from "@/components/useNavCounts";
import { pastAnnouncement, viewAnnouncement } from "@/lib/queueA11y";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useNow } from "@/lib/useNow";
import {
  QUERY_DAYS,
  SHOWN_DAYS,
  countDays,
  failedCards,
  firstGap,
  formatStamp,
  PAST_DAYS,
  PAST_MAX_PAGES,
  PLATFORM_NAME,
  pastHeadline,
  pastRangeLabel,
  pastWindowStart,
  queueHeadline,
  shortDay,
  startOfToday,
  timelineModel,
  type BoardDay,
  type PlatformFilter,
  type View,
} from "@/lib/queueBoard";
import { api } from "../../../../convex/_generated/api";
import Agenda from "./Agenda";
import DrawerBoundary from "./DrawerBoundary";
import FailureBanner, { type Failure } from "./FailureBanner";
import RangeGrid from "./RangeGrid";
import SlotDrawer from "./SlotDrawer";
import Timeline from "./Timeline";
import WeekGrid from "./WeekGrid";
import { useSheetFocus } from "./useSheetFocus";

const RANGES = [
  { value: "past", label: "Past" },
  { value: "week", label: "Week" },
  { value: "three", label: "3 weeks" },
  { value: "month", label: "Month" },
] as const;

const PLATFORMS = [
  { value: "both", label: "Both" },
  { value: "threads", label: "Threads" },
  { value: "instagram", label: "Instagram" },
] as const;

const SLOT_PARAM = /^[A-Za-z0-9]{10,64}$/;

/**
 * Queue screen (boards 03, 07g, 07h): week / 3 weeks / month, platform filter, timeline strip and the slot drawer.
 * "Past" looks back a week at a time at what already went out (and what failed), read-only.
 */
export default function QueueBoard() {
  const now = useNow();
  const tz = useBrowserTz();
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>("week");
  const [pagesBack, setPagesBack] = useState(1);
  const [platform, setPlatform] = useState<PlatformFilter>("both");
  const past = view === "past";
  const range = past ? "week" : view;

  const from = useMemo(() => startOfToday(now, tz), [now, tz]);
  const data = useQuery(api.queueBoard.dayColumns, { from, days: QUERY_DAYS, tz });
  // The Past page is its own read, only while it is shown (and it keeps the last page up while the next one loads).
  const pastFrom = useMemo(() => pastWindowStart(now, tz, pagesBack), [now, tz, pagesBack]);
  const pastData = useStableQuery(api.queueBoard.dayColumns, past ? { from: pastFrom, days: PAST_DAYS, tz } : "skip");
  const settings = useQuery(api.settings.get, {});
  const summary = useStableQuery(api.today.summary, { now, tz });
  const inbox = useNavCounts().research;

  const slotParam = params.get("slot");
  const slotId = slotParam && SLOT_PARAM.test(slotParam) ? slotParam : null;
  const { remember } = useSheetFocus(slotId);
  const open = useCallback(
    (id: string) => {
      remember();
      router.push(`/queue?slot=${id}`, { scroll: false });
    },
    [router, remember]
  );
  const close = useCallback(() => router.replace("/queue", { scroll: false }), [router]);

  if (data === undefined) return <QueueSkeleton />;

  const days: BoardDay[] = data.days;
  const shown = past ? (pastData?.days ?? []) : days.slice(0, SHOWN_DAYS[range]);
  const pastLabel = pastRangeLabel(shown);
  const pastLine = pastHeadline(shown);
  const pastFailed = shown.flatMap((d) => [...d.threads, ...d.instagram]).filter((c) => c.status === "failed").length;
  const model = timelineModel(days, platform);
  const gap = firstGap(days, platform);
  const all = countDays(days, "both", QUERY_DAYS);
  const empty = all.threads + all.instagram === 0;
  const window = countDays(days, platform, 21);
  const week = countDays(days, "both", 7);
  const headline = past ? pastLine : queueHeadline(model.covered, window.threads + window.instagram);
  // Failures the columns cannot show (before today) come from the Today alerts, so none is missed.
  const failures: Failure[] = [
    ...(summary?.alerts ?? [])
      .filter((a) => a.kind === "failed" && a.slotId)
      .map((a) => ({ slotId: a.slotId as string, title: a.title, reason: a.detail })),
    ...failedCards(days).map((c) => ({
      slotId: c._id as string,
      title: `${PLATFORM_NAME[c.platform]} post failed · ${formatStamp(c.scheduledAt, data.tz)}.`,
      reason: c.lastError ?? "The publisher gave up on this post. Retry or reschedule it.",
    })),
  ].filter((f, i, all) => all.findIndex((o) => o.slotId === f.slotId) === i);
  const pillars = settings?.pillars ?? [];
  const pillarNames = Object.fromEntries(pillars.map((p) => [p.color, p.name]));

  const leadTitle = `${headline.top} ${headline.rust}${headline.rest}`.trim();
  const lead = empty ? (
    <>
      <b>Nothing scheduled yet.</b> {week.open} open {week.open === 1 ? "slot" : "slots"} this week.
    </>
  ) : (
    <>
      <b>{leadTitle}</b> {gap ? `Next gap: ${shortDay(gap.day.key)}, ${gap.time}.` : "No gaps in the next 21 days."}
    </>
  );

  return (
    <div className="sq-q-page">
      <FailureBanner failed={failures} tz={data.tz} onOpen={open} />

      {/* Heard when the range or platform changes (and when posts are added or removed). */}
      <p className="sq-sr" role="status">
        {past ? pastAnnouncement(shown, platform, pastLabel) : viewAnnouncement(days, range, platform)}
      </p>

      <div className="sq-q-toolbar">
        <div className="sq-q-rangectl">
          <SegmentedControl
            label="Range"
            options={[...RANGES]}
            value={view}
            onChange={(next) => {
              setView(next);
              if (next === "past") setPagesBack(1);
            }}
          />
        </div>
        <div className="sq-q-toolbar-right">
          <SegmentedControl label="Platform" options={[...PLATFORMS]} value={platform} onChange={setPlatform} />
          <Link href="/settings/slots" className="sq-btn sq-q-rules">
            <SettingsIcon />
            <span className="sq-q-rules-label">Slot rules</span>
          </Link>
          <Link href="/studio" className="sq-btn sq-btn-primary sq-q-newtopic">
            <PlusIcon />
            New from topic
          </Link>
        </div>
      </div>

      <PageHeader
        headline={
          <>
            <span className="sq-sr">Queue: </span>
            {headline.top}
            <br />
            <em>{headline.rust}</em>
            {headline.rest}
          </>
        }
        aside={
          past ? (
            "What already went out, a week at a time. Click a card for its text and receipts."
          ) : empty ? (
            <span className="sq-q-aside">Drop a topic and I&apos;ll draft both platforms.</span>
          ) : (
            "Click any card for its text, receipts and reschedule. Open slots show in dashed rust; one click starts a draft in Studio."
          )
        }
        actions={
          empty && !past ? (
            <>
              <Link href="/studio" className="sq-btn sq-btn-primary">
                Open Studio
                <ArrowRightIcon />
              </Link>
              <Link href="/research" className="sq-btn">
                Pick from research · {inbox}
              </Link>
            </>
          ) : null
        }
      />
      <p className="sq-q-lead">{lead}</p>

      <div className="sq-q-desktop">
        {past && (
          <div className="sq-q-pastnav">
            <button
              type="button"
              className="sq-btn"
              disabled={pagesBack >= PAST_MAX_PAGES}
              onClick={() => setPagesBack((n) => Math.min(PAST_MAX_PAGES, n + 1))}
            >
              ← Earlier
            </button>
            <span className="t-meta sq-q-pastlabel">
              {pastLabel}
              {pastFailed > 0 ? ` · ${pastFailed} FAILED` : ""}
            </span>
            <button type="button" className="sq-btn" disabled={pagesBack <= 1} onClick={() => setPagesBack((n) => Math.max(1, n - 1))}>
              Later →
            </button>
          </div>
        )}
        {past ? (
          <WeekGrid days={shown} platform={platform} past onOpen={open} />
        ) : range === "week" ? (
          <WeekGrid days={shown} platform={platform} onOpen={open} />
        ) : (
          <RangeGrid days={shown} platform={platform} onOpen={open} />
        )}
      </div>
      <Agenda days={days.slice(0, 7)} platform={platform} pillarNames={pillarNames} empty={empty} onOpen={open} />

      <div className="sq-q-foot">
        {!past && <Timeline days={days} model={model} gap={gap} />}
        <div className="sq-q-legendrow">
          <ul className="sq-q-legend">
            {pillars.map((p) => (
              <li key={p.key}>
                <i style={{ background: `var(--color-${p.color})` }} aria-hidden="true" />
                {p.name}
              </li>
            ))}
          </ul>
          <span className="t-meta sq-q-totals">
            {past
              ? `${countDays(shown, platform, PAST_DAYS).threads} THREADS · ${countDays(shown, platform, PAST_DAYS).instagram} INSTAGRAM`
              : empty
                ? `0 SCHEDULED · ${week.open} OPEN SLOTS THIS WEEK`
                : `${window.threads} THREADS · ${window.instagram} INSTAGRAM · $0 PER-POST FEES`}
          </span>
        </div>
      </div>

      <DrawerBoundary key={slotId ?? "none"} onClose={close}>
        <SlotDrawer slotId={slotId} tz={data.tz} onClose={close} />
      </DrawerBoundary>
    </div>
  );
}
