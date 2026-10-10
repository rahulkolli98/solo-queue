import {
  PLATFORM_NAME,
  SHOWN_DAYS,
  countDays,
  dayCards,
  shortDay,
  type BoardDay,
  type Platform,
  type PlatformFilter,
  type Range,
  type SlotStatus,
} from "./queueBoard";

/**
 * Words for assistive tech on the Queue: what a slot card, a day cell and the
 * current view are called, and where focus goes when the slot sheet closes.
 * Pure strings and choices (no React, no DOM), so each is unit-tested.
 */

const STATUS_WORD: Record<SlotStatus, string> = {
  scheduled: "scheduled",
  claimed: "claimed",
  published: "published",
  failed: "failed",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface SlotCardFacts {
  platform: Platform;
  /** The Instagram format (reel, carousel, ...); Threads cards are always "post". */
  format?: string | null;
  /** A carousel: how many slides it has. */
  slideCount?: number | null;
  time: string;
  topicTitle: string;
  status: SlotStatus;
  atRisk?: string | null;
}

/**
 * The accessible name of a slot card: platform, kind, day, time, topic and the
 * status as a word ("Instagram reel on Tue 6 Oct at 12:00, Title, scheduled.").
 * `dayLabel` ("Tue 6 Oct") is left out only where the day is not known.
 */
export function slotCardLabel(card: SlotCardFacts, dayLabel?: string): string {
  const base = card.platform === "instagram" ? (card.format ?? "post") : "post";
  const kind =
    card.format === "carousel" && card.slideCount ? `carousel of ${card.slideCount} ${card.slideCount === 1 ? "slide" : "slides"}` : base;
  const day = dayLabel ? ` on ${dayLabel}` : "";
  const risk = card.atRisk ? ` At risk: ${card.atRisk}` : "";
  return `${PLATFORM_NAME[card.platform]} ${kind}${day} at ${card.time}, ${card.topicTitle}, ${STATUS_WORD[card.status]}.${risk} Open details.`;
}

/**
 * The name of one day's cell: the day, whether it is today, and what it holds
 * in words (posts, failures, open slots), so a day with nothing is not silent.
 */
export function dayGroupLabel(day: BoardDay, platform: PlatformFilter): string {
  const cards = dayCards(day, platform);
  const failed = cards.filter((c) => c.status === "failed").length;
  const open =
    (platform === "instagram" ? 0 : day.open.threads.length) + (platform === "threads" ? 0 : day.open.instagram.length);
  const parts: string[] = [];
  if (cards.length > 0) {
    parts.push(plural(cards.length, "post", "posts") + (failed > 0 ? `, ${failed} failed` : ""));
  }
  if (open > 0) parts.push(plural(open, "open slot", "open slots"));
  if (parts.length === 0) parts.push("No slot");
  return `${shortDay(day.key)}${day.isToday ? ", today" : ""}. ${parts.join(", ")}.`;
}

const RANGE_WORD: Record<Range, string> = { week: "the week", three: "3 weeks", month: "the month" };
const PLATFORM_WORD: Record<PlatformFilter, string> = {
  both: "Threads and Instagram",
  threads: "Threads only",
  instagram: "Instagram only",
};

/** A polite status line for the board, so changing the range or platform is heard: "Showing 3 weeks, Threads only. 4 posts, 12 open slots." */
export function viewAnnouncement(days: BoardDay[], range: Range, platform: PlatformFilter): string {
  const c = countDays(days, platform, SHOWN_DAYS[range]);
  return `Showing ${RANGE_WORD[range]}, ${PLATFORM_WORD[platform]}. ${plural(c.threads + c.instagram, "post", "posts")}, ${plural(c.open, "open slot", "open slots")}.`;
}

/** The status line for a Past page: "Showing the past, 2 OCT → 8 OCT, Threads only. 3 posts." */
export function pastAnnouncement(days: BoardDay[], platform: PlatformFilter, rangeLabel: string): string {
  const c = countDays(days, platform, days.length);
  return `Showing the past, ${rangeLabel}, ${PLATFORM_WORD[platform]}. ${plural(c.threads + c.instagram, "post", "posts")}.`;
}

/** How long the Cancel post button stays armed before it resets. */
export const CANCEL_ARM_MS = 5000;

/** What the Cancel post button says out loud while it waits for the second press. */
export function cancelStatus(armed: boolean): string {
  return armed
    ? `Press Cancel post again within ${CANCEL_ARM_MS / 1000} seconds to cancel this post. The draft is kept.`
    : "";
}

/**
 * Where focus goes when the slot sheet closes: the first candidate still on
 * the page. Pass the card that opened the sheet, then the post's card looked up
 * again by id (a moved post is a new element), then a fixed spot on the board
 * (a cancelled post has no card left). Null when none is left.
 */
export function pickReturnFocus<T extends { isConnected: boolean }>(...candidates: (T | null | undefined)[]): T | null {
  return candidates.find((c): c is T => Boolean(c?.isConnected)) ?? null;
}
