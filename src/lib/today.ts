import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { isoWeekKey } from "../../convex/lib/coverage";
import { addDays, dayMonth, shortDay } from "./queueBoard";

/**
 * Pure helpers for the Today board: labels, the data-built headline and
 * coverage sentence, token and connection wording, the pillar insight and
 * the first-run topic payload. Unit-tested; no React, no Convex client.
 */

export type TodaySummary = FunctionReturnType<typeof api.today.summary>;
export type Platform = "threads" | "instagram";

export const RUNWAY_DAYS = 21;
/** A platform with fewer written days than this is "thin" (the coverage nudge fires below it). */
export const THIN_DAYS = 3;
const EXPIRY_WARNING_DAYS = 21;

/** "Week 39", the ISO week of `now` in the founder's zone. */
export function weekTag(now: number, tz: string): string {
  const key = isoWeekKey(now, tz);
  return `Week ${Number(key.split("-W")[1])}`;
}

/** "in 14m", "in 2h 14m", "in 3d 4h" for a gap in milliseconds; "now" at or below zero. */
export function relativeIn(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** "25 SEP → 15 OCT" for the 21-day runway starting at the day key. */
export function runwayRange(todayKey: string): string {
  return `${dayMonth(todayKey)} → ${dayMonth(addDays(todayKey, RUNWAY_DAYS - 1))}`;
}

/** "FRI 25" style label for a day key. */
export function runwayDay(key: string): string {
  const [, , day] = key.split("-").map(Number);
  return `${shortDay(key).slice(0, 3).toUpperCase()} ${day}`;
}

export interface Coverage {
  days: number;
  /** The last covered day ("Wed 14 Oct"), or null when nothing is written. */
  through: string | null;
  /** True when the whole runway is written, so coverage is at least `days`. */
  capped: boolean;
}

export function coverageOf(todayKey: string, daysAhead: number): Coverage {
  return {
    days: daysAhead,
    through: daysAhead > 0 ? shortDay(addDays(todayKey, daysAhead - 1)) : null,
    capped: daysAhead >= RUNWAY_DAYS,
  };
}

export function queuedTotal(summary: Pick<TodaySummary, "runway">): number {
  return summary.runway.threads.posts + summary.runway.instagram.posts;
}

export function openCellCount(summary: Pick<TodaySummary, "runway">): number {
  const count = (cells: string[]) => cells.filter((c) => c === "open").length;
  return count(summary.runway.threads.cells) + count(summary.runway.instagram.cells);
}

/** The earliest empty posting day over both platforms, with the platform it belongs to. */
export function nextOpenDay(summary: Pick<TodaySummary, "runway">): { platform: Platform; key: string } | null {
  const a = summary.runway.threads.emptyDays[0];
  const b = summary.runway.instagram.emptyDays[0];
  if (a && (!b || a <= b)) return { platform: "threads", key: a };
  if (b) return { platform: "instagram", key: b };
  return null;
}

/** Index of the first open cell over both platforms, or -1. */
export function firstOpenCell(summary: Pick<TodaySummary, "runway">): number {
  const idx = [summary.runway.threads.cells, summary.runway.instagram.cells]
    .map((cells) => cells.indexOf("open"))
    .filter((i) => i >= 0);
  return idx.length ? Math.min(...idx) : -1;
}

export interface TodayHeadline {
  top: string;
  plain: string;
  rust: string;
}

/** "38 posts queued. / Nothing to write today." built from the live numbers. */
export function todayHeadline(summary: TodaySummary): TodayHeadline {
  const total = queuedTotal(summary);
  const top = total === 0 ? "Nothing queued." : `${total} post${total === 1 ? "" : "s"} queued.`;
  const failed = summary.alerts.filter((a) => a.kind === "failed").length;
  if (failed > 0) return { top, plain: "Fix the failed ", rust: failed === 1 ? "post." : "posts." };
  const connected = summary.meta.connections.filter((c) => c.connected).map((c) => c.platform);
  const thin = connected.some((p) => summary.runway[p].daysAhead < THIN_DAYS);
  if (total === 0 || thin) return { top, plain: "Write something ", rust: "today." };
  return { top, plain: "Nothing to write ", rust: "today." };
}

/** Pillar mix insight line ("Movies & series is 12 points under target."). */
export function pillarInsight(mix: TodaySummary["pillarMix"]): string {
  const total = mix.reduce((n, p) => n + p.count, 0);
  if (total === 0) return "Nothing queued, so no mix yet.";
  let worst = mix[0];
  let gap = 0;
  for (const p of mix) {
    const diff = p.actual - p.target;
    if (Math.abs(diff) > Math.abs(gap)) {
      worst = p;
      gap = diff;
    }
  }
  if (Math.abs(gap) < 10) return "On target.";
  return `${worst.name} is ${Math.abs(gap)} points ${gap < 0 ? "under" : "over"} target.`;
}

type Connection = TodaySummary["meta"]["connections"][number];

/** Mono label for a token row: "REFRESH IN 41 D", "EXPIRES IN 6 D", "NEEDS RECONNECT", "NOT CONNECTED". */
export function tokenLabel(c: Connection): { text: string; warn: boolean } {
  if (!c.connected) return { text: "NOT CONNECTED", warn: false };
  if (c.status === "failed") return { text: "NEEDS RECONNECT", warn: true };
  if (c.tokenDaysLeft <= EXPIRY_WARNING_DAYS) return { text: `EXPIRES IN ${Math.max(c.tokenDaysLeft, 0)} D`, warn: true };
  return { text: `REFRESH IN ${c.tokenDaysLeft} D`, warn: false };
}

export type MetaState = "healthy" | "needs" | "none";

export function metaState(connections: Connection[]): MetaState {
  const live = connections.filter((c) => c.connected);
  if (live.length === 0) return "none";
  return live.some((c) => tokenLabel(c).warn) ? "needs" : "healthy";
}

/** The first connection that needs the founder, for the card's "Reconnect Threads" button. */
export function connectionNeedingYou(connections: Connection[]): Platform | null {
  const hit = connections.find((c) => c.connected && tokenLabel(c).warn);
  return hit ? hit.platform : null;
}

export function charLimit(platform: Platform): number {
  return platform === "threads" ? 500 : 2200;
}

/** The topic a first-run input becomes: a pasted link keeps its URL and takes the host as a title. */
export function topicFromInput(raw: string): { title: string; sourceUrl?: string } | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const host = new URL(text).hostname.replace(/^www\./, "");
      return { title: host, sourceUrl: text };
    } catch {
      return { title: text };
    }
  }
  return { title: text };
}

/** Accessible description of one runway strip. */
export function runwayAria(platformName: string, cells: string[], emptyDays: string[]): string {
  const written = cells.filter((c) => c === "written").length;
  const gap = emptyDays[0] ? `First gap ${shortDay(emptyDays[0])}.` : "No gaps.";
  return `${platformName}: ${written} of ${cells.length} days written. ${gap}`;
}

/** Right-hand text of the runway header: the date span, or what needs attention when alerts are up. */
export function runwayNote(summary: TodaySummary): { text: string; warn: boolean } {
  const parts: string[] = [];
  const failed = summary.alerts.filter((a) => a.kind === "failed").length;
  const open = openCellCount(summary);
  if (summary.alerts.length > 0) {
    if (failed > 0) parts.push(`${failed} FAILED`);
    if (open > 0) parts.push(`${open} OPEN`);
    if (summary.alerts.some((a) => a.kind === "expiring")) parts.push("TOKEN AT RISK");
  }
  if (parts.length === 0) return { text: runwayRange(summary.today), warn: false };
  return { text: parts.join(" · "), warn: true };
}
