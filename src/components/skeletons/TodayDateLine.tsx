"use client";

import { useSyncExternalStore } from "react";
import Skeleton from "@/components/ui/Skeleton";
import { longDay } from "@/lib/queueBoard";
import { weekTag } from "@/lib/today";
import { dayKey } from "../../../convex/lib/zoned";

function subscribe(): () => void {
  return () => {};
}

/** "Friday, 25 September" and "Week 39" for an instant in a zone: the same helpers the real Today top bar uses. */
export function dateLineParts(now: number, tz: string): { date: string; week: string } {
  return { date: longDay(dayKey(now, tz)), week: weekTag(now, tz) };
}

function clientSnapshot(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { date, week } = dateLineParts(Date.now(), tz);
  return `${date}|${week}`;
}

/**
 * Today's date line and Week tag for the loading screen. The server (and the
 * first client render, so hydration matches) has no browser clock or zone, so
 * it draws blank shapes; right after hydration the real date and tag replace them.
 */
export default function TodayDateLine() {
  const text = useSyncExternalStore(subscribe, clientSnapshot, () => "");
  if (!text) {
    return (
      <div className="sq-skel-datewrap">
        <Skeleton w={220} h={26} />
        <Skeleton w={72} h={24} r={12} />
      </div>
    );
  }
  const [date, week] = text.split("|");
  return (
    <div className="sq-skel-datewrap">
      <span className="t-date">{date}</span>
      <span className="sq-tag">{week}</span>
    </div>
  );
}
