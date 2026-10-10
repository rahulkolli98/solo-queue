import { resolveTz, zonedParts, zonedWallToUtc } from "../../convex/lib/zoned";

/**
 * Pure helpers for the Queue board: the range and platform filters, day
 * states for the timeline strip, the first gap, counts, and the conversions
 * between a UTC instant and the datetime-local text of the reschedule field
 * (always in the founder's zone). Unit-tested; no React, no Convex client.
 */

export type Range = "week" | "three" | "month";
/** What the board shows: a range ahead, or the days that already went by (read-only). */
export type View = Range | "past";
export type PlatformFilter = "both" | "threads" | "instagram";
export type Platform = "threads" | "instagram";
export type SlotStatus = "scheduled" | "claimed" | "published" | "failed";

/** Days the board asks the backend for, whatever the range: one stable query, sliced per range. */
export const QUERY_DAYS = 30;
/** Days drawn as cards for each range. */
export const SHOWN_DAYS: Record<Range, number> = { week: 7, three: 21, month: 30 };
export const TIMELINE_DAYS = 21;
/** Days in one Past page, and how many pages back it goes. */
export const PAST_DAYS = 7;
export const PAST_MAX_PAGES = 52;

export interface BoardCard {
  _id: string;
  /** The draft this post is; present on cards from the board query. */
  draftId?: string;
  platform: Platform;
  scheduledAt: number;
  time: string;
  status: SlotStatus;
  topicTitle: string;
  snippet: string;
  constraintOk: boolean;
  pillarColor: string;
  format: string | null;
  hasMedia: boolean;
  /** A carousel: how many slides it has (null for any other post). */
  slideCount?: number | null;
  attempts: number;
  lastError: string | null;
  /** Why a scheduled post may not go out (a connection problem), else null. */
  atRisk?: string | null;
}

export interface BoardDay {
  key: string;
  weekday: number;
  label: string;
  isToday: boolean;
  threads: BoardCard[];
  instagram: BoardCard[];
  open: Record<Platform, string[]>;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const PLATFORM_NAME: Record<Platform, string> = { threads: "Threads", instagram: "Instagram" };

function parseKey(key: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return { year, month, day, weekday };
}

/** "Sat 10 Oct" from a YYYY-MM-DD day key. */
export function shortDay(key: string): string {
  const p = parseKey(key);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "Friday, 25 September" from a YYYY-MM-DD day key. */
export function longDay(key: string): string {
  const p = parseKey(key);
  return `${WEEKDAYS_LONG[p.weekday]}, ${p.day} ${MONTHS_LONG[p.month - 1]}`;
}

/** "25 SEP" style label (upper case) from a day key. */
export function dayMonth(key: string): string {
  const p = parseKey(key);
  return `${p.day} ${MONTHS[p.month - 1].toUpperCase()}`;
}

/** The weekday name alone ("Friday") from a day key. */
export function weekdayName(key: string): string {
  return WEEKDAYS_LONG[parseKey(key).weekday];
}

/** Local midnight of the day containing `now`, in `tz`, as a UTC instant. */
export function startOfToday(now: number, tz: string): number {
  const zone = resolveTz(tz);
  const p = zonedParts(now, zone);
  return zonedWallToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, zone);
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * Where the board's query starts for Past page `pagesBack` (1 = the 7 days before today, 2 = the 7 before those).
 * It lands 3 hours after local midnight of the first day, so a clock change in between cannot move it to the day
 * before or after; the backend reads the day from this instant and fetches from a day earlier.
 */
export function pastWindowStart(now: number, tz: string, pagesBack: number): number {
  return startOfToday(now, tz) - pagesBack * PAST_DAYS * DAY_MS + 3 * HOUR_MS;
}

/** "2 OCT → 8 OCT" for the days of a Past page. */
export function pastRangeLabel(days: BoardDay[]): string {
  if (days.length === 0) return "";
  return `${dayMonth(days[0].key)} → ${dayMonth(days[days.length - 1].key)}`;
}

/** The headline for a Past page: how many posts went out in those days. */
export function pastHeadline(days: BoardDay[]): Headline {
  const cards = days.flatMap((d) => [...d.threads, ...d.instagram]);
  const out = cards.filter((c) => c.status === "published").length;
  if (out === 0) return { top: "Nothing went", rust: "out", rest: " then." };
  return { top: `${out} post${out === 1 ? "" : "s"}`, rust: "went out.", rest: "" };
}

/** "Sat 26 Sep, 12:00" in the founder's zone, 24-hour. */
export function formatStamp(ts: number, tz: string): string {
  const p = zonedParts(ts, resolveTz(tz));
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}, ${hh}:${mm}`;
}

/** Text for an <input type="datetime-local"> showing `ts` as wall time in `tz`. */
export function toInputValue(ts: number, tz: string): string {
  const p = zonedParts(ts, resolveTz(tz));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The UTC instant for a datetime-local value read as wall time in `tz`; null when malformed. */
export function fromInputValue(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  return zonedWallToUtc({ year, month, day, hour, minute }, resolveTz(tz));
}

/** The cards of a day for the visible platform(s), in time order. */
export function dayCards(day: BoardDay, platform: PlatformFilter): BoardCard[] {
  const cards: BoardCard[] = [];
  if (platform !== "instagram") cards.push(...day.threads);
  if (platform !== "threads") cards.push(...day.instagram);
  return cards.sort((a, b) => a.scheduledAt - b.scheduledAt);
}

function platforms(platform: PlatformFilter): Platform[] {
  return platform === "both" ? ["threads", "instagram"] : [platform];
}

export type DayState = "written" | "gap" | "off";

/**
 * gap: a visible platform still has open slots and no post that day.
 * written: a visible platform has a post that day. off: nothing to write.
 */
export function dayState(day: BoardDay, platform: PlatformFilter): DayState {
  const list = platforms(platform);
  if (list.some((p) => day.open[p].length > 0 && day[p].length === 0)) return "gap";
  if (list.some((p) => day[p].length > 0)) return "written";
  return "off";
}

export interface TimelineModel {
  states: DayState[];
  /** Index of the first gap day, or -1 when the window has none. */
  firstGap: number;
  /** Days from today before the first gap (the whole window when there is none). */
  covered: number;
}

export function timelineModel(days: BoardDay[], platform: PlatformFilter): TimelineModel {
  const states = days.slice(0, TIMELINE_DAYS).map((d) => dayState(d, platform));
  const firstGap = states.indexOf("gap");
  return { states, firstGap, covered: firstGap === -1 ? states.length : firstGap };
}

export interface FirstGap {
  day: BoardDay;
  platform: Platform;
  /** HH:MM of the earliest open slot on that day for that platform. */
  time: string;
}

/** The earliest day with a hole in the visible platform(s), and its first open time. */
export function firstGap(days: BoardDay[], platform: PlatformFilter): FirstGap | null {
  for (const day of days.slice(0, TIMELINE_DAYS)) {
    let best: FirstGap | null = null;
    for (const p of platforms(platform)) {
      if (day.open[p].length === 0 || day[p].length > 0) continue;
      const time = [...day.open[p]].sort()[0];
      if (!best || time < best.time) best = { day, platform: p, time };
    }
    if (best) return best;
  }
  return null;
}

export interface Counts {
  threads: number;
  instagram: number;
  open: number;
  failed: number;
}

/** Posts, open slots and failures in the first `count` days for the visible platform(s). */
export function countDays(days: BoardDay[], platform: PlatformFilter, count: number): Counts {
  const out: Counts = { threads: 0, instagram: 0, open: 0, failed: 0 };
  for (const day of days.slice(0, count)) {
    for (const p of platforms(platform)) {
      out[p] += day[p].length;
      out.open += day.open[p].length;
      out.failed += day[p].filter((c) => c.status === "failed").length;
    }
  }
  return out;
}

/** Failed cards across the window, oldest first. */
export function failedCards(days: BoardDay[]): BoardCard[] {
  return days
    .flatMap((d) => [...d.threads, ...d.instagram])
    .filter((c) => c.status === "failed")
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
}

export interface Headline {
  /** First line, then the one rust word, then the rest of the second line. */
  top: string;
  rust: string;
  rest: string;
}

/** The data-built statement: how far ahead the queue is written. */
export function queueHeadline(covered: number, posts: number): Headline {
  if (posts === 0) return { top: "Queue's", rust: "empty.", rest: "" };
  if (covered >= TIMELINE_DAYS) return { top: "Three weeks,", rust: "already", rest: " written." };
  if (covered >= 14) return { top: "Two weeks,", rust: "already", rest: " written." };
  if (covered >= 7) return { top: "A week,", rust: "already", rest: " written." };
  if (covered >= 1) return { top: `${covered} day${covered === 1 ? "" : "s"},`, rust: "already", rest: " written." };
  return { top: "Gaps in the", rust: "queue.", rest: "" };
}

export interface TimelineLabel {
  col: number;
  span: number;
  text: string;
  tone: "plain" | "gap";
  end?: boolean;
}

export interface LabelFormat {
  today: (key: string) => string;
  day: (key: string) => string;
  gap: (key: string) => string;
}

/**
 * Labels under a 21-cell strip: today, a week out, the first gap and the last
 * day. The gap label displaces any label it would overlap. `gap` is the cell
 * index of the first gap, or -1.
 */
export function stripLabels(keys: string[], gap: number, fmt: LabelFormat): TimelineLabel[] {
  const labels: TimelineLabel[] = [];
  const gapCol = gap === -1 ? 0 : Math.min(Math.max(gap + 1, 4), 17);
  if (keys[0]) labels.push({ col: 1, span: 3, text: fmt.today(keys[0]), tone: "plain" });
  const midClear = gap === -1 || gapCol >= 11 || gapCol + 5 <= 8;
  if (keys[7] && midClear) labels.push({ col: 8, span: 3, text: fmt.day(keys[7]), tone: "plain" });
  if (gap !== -1 && keys[gap]) labels.push({ col: gapCol, span: 5, text: fmt.gap(keys[gap]), tone: "gap" });
  if (keys[20] && (gap === -1 || gapCol + 5 <= 19)) {
    labels.push({ col: 19, span: 3, text: fmt.day(keys[20]), tone: "plain", end: true });
  }
  return labels;
}

/** Labels for the Queue timeline strip ("25 SEP · TODAY" ... "▲ GAP · SAT 10 OCT"). */
export function timelineLabels(days: BoardDay[], model: TimelineModel): TimelineLabel[] {
  return stripLabels(
    days.slice(0, TIMELINE_DAYS).map((d) => d.key),
    model.firstGap,
    {
      today: (k) => `${dayMonth(k)} · TODAY`,
      day: dayMonth,
      gap: (k) => `▲ GAP · ${shortDay(k).toUpperCase()}`,
    }
  );
}

/** The day key `n` calendar days after `key`. */
export function addDays(key: string, n: number): string {
  const p = parseKey(key);
  const t = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
