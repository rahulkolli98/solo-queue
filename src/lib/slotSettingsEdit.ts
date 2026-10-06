import { META_DAILY_LIMITS, type AppSettings } from "../../convex/lib/settingsModel";
import { dayKey, resolveTz, zonedParts, zonedWallToUtc } from "../../convex/lib/zoned";

/**
 * Pure helpers for the Posting slots and Queue rules Settings sections:
 * validating and merging slot times, weekday toggles, the time zone list, the
 * vacation window (dates <-> ms in a time zone) and the queue rules. They build
 * the COMPLETE section object, because `settings.update` replaces a whole
 * top-level section. No React, no Convex calls.
 *
 * Weekday numbering is Monday = 0 ... Sunday = 6 (see convex/lib/zoned.ts and
 * the `slotDays` use in queueBoard.ts), NOT the JavaScript Sunday = 0.
 */

export type Platform = "threads" | "instagram";
export type EditResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const PLATFORMS: ReadonlyArray<{ key: Platform; label: string }> = [
  { key: "threads", label: "Threads" },
  { key: "instagram", label: "Instagram" },
];

/* ---------- slot times ---------- */

export const SLOT_TIMES_MAX = 8;
export const KEEP_ONE_TIME_MESSAGE =
  "Keep at least one time, or turn off the days below to pause this platform.";

/** "9:30", "09:30" or "09:30:00" as "09:30"; null when it is not a 24-hour time. */
export function normaliseTime(raw: string): string | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(raw.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** Add a time (sorted, no duplicates, at most 8), or say plainly why not. */
export function addSlotTime(times: readonly string[], raw: string): EditResult<string[]> {
  if (!raw.trim()) return { ok: false, message: "Pick a time to add." };
  const time = normaliseTime(raw);
  if (!time) return { ok: false, message: `"${raw.trim()}" is not a time. Use 24-hour HH:MM, like 19:00.` };
  if (times.includes(time)) return { ok: false, message: `${time} is already in the list.` };
  if (times.length >= SLOT_TIMES_MAX) {
    return { ok: false, message: `A platform holds up to ${SLOT_TIMES_MAX} times. Remove one to add another.` };
  }
  return { ok: true, value: [...times, time].sort() };
}

/** Remove a time; the last one cannot be removed. */
export function removeSlotTime(times: readonly string[], time: string): EditResult<string[]> {
  const next = times.filter((t) => t !== time);
  if (next.length === times.length) return { ok: true, value: [...times] };
  if (next.length === 0) return { ok: false, message: KEEP_ONE_TIME_MESSAGE };
  return { ok: true, value: next };
}

export function mergeSlotDefaults(
  current: AppSettings["slotDefaults"],
  platform: Platform,
  times: readonly string[]
): AppSettings["slotDefaults"] {
  return { ...current, [platform]: [...times] };
}

/** "3 / DAY" style count for the card header. */
export function perDayText(times: readonly string[]): string {
  return `${times.length} / DAY`;
}

/* ---------- weekdays ---------- */

/** The week as shown on the board, Monday first, with the stored number (Mon = 0). */
export const WEEK: ReadonlyArray<{ day: number; letter: string; label: string }> = [
  { day: 0, letter: "M", label: "Monday" },
  { day: 1, letter: "T", label: "Tuesday" },
  { day: 2, letter: "W", label: "Wednesday" },
  { day: 3, letter: "T", label: "Thursday" },
  { day: 4, letter: "F", label: "Friday" },
  { day: 5, letter: "S", label: "Saturday" },
  { day: 6, letter: "S", label: "Sunday" },
];

/** Switch one weekday on or off; the result is sorted and has no duplicates. */
export function toggleDay(days: readonly number[], day: number): number[] {
  const set = new Set(days);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b);
}

export function mergeSlotDays(
  current: AppSettings["slotDays"],
  platform: Platform,
  days: readonly number[]
): AppSettings["slotDays"] {
  return { ...current, [platform]: [...days] };
}

/* ---------- time zone ---------- */

export interface SelectOption {
  value: string;
  label: string;
}

export const AUTO_TIMEZONE_LABEL = "Auto (detected from your browser)";

export const COMMON_TIMEZONES: readonly string[] = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Toronto",
  "America/Mexico_City",
  "Pacific/Honolulu",
];

function zoneLabel(zone: string): string {
  return zone.replace(/_/g, " ");
}

/** "Auto", the common zones, and the saved zone when it is not one of them. */
export function timezoneOptions(saved: string): SelectOption[] {
  const options: SelectOption[] = [{ value: "auto", label: AUTO_TIMEZONE_LABEL }];
  for (const zone of COMMON_TIMEZONES) options.push({ value: zone, label: zoneLabel(zone) });
  if (saved && !options.some((o) => o.value === saved)) {
    options.push({ value: saved, label: zoneLabel(saved) });
  }
  return options;
}

/** The zone dates are read in: the saved zone when it is a real one, else the browser's, else UTC. */
export function effectiveTz(saved: string, browserTz: string): string {
  if (saved !== "auto" && resolveTz(saved) === saved) return saved;
  return resolveTz(browserTz);
}

/* ---------- vacation ---------- */

export type Vacation = { from: number; to: number };
export type VacationState = "off" | "upcoming" | "active";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** `YYYY-MM-DD` of an instant in a time zone, as `<input type="date">` wants it. */
export function dateInputValue(ms: number, tz: string): string {
  return dayKey(ms, tz);
}

/** Start of the given calendar day in `tz`. */
function startOfDay(d: { year: number; month: number; day: number }, tz: string): number {
  return zonedWallToUtc({ ...d, hour: 0, minute: 0 }, tz);
}

/** The last millisecond of the given calendar day in `tz`. */
function endOfDay(d: { year: number; month: number; day: number }, tz: string): number {
  const next = new Date(Date.UTC(d.year, d.month - 1, d.day + 1));
  const start = zonedWallToUtc(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0 },
    tz
  );
  return start - 1;
}

/**
 * From and To dates as the stored window: From is the start of its day, To the
 * end of its day, both in `tz`. The end date may equal the start date (a
 * one-day pause) but not come before it.
 */
export function vacationFromDates(from: string, to: string, tz: string): EditResult<Vacation> {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return { ok: false, message: "Pick both a start date and an end date." };
  const fromMs = startOfDay(a, tz);
  const toMs = endOfDay(b, tz);
  if (!(toMs > fromMs)) return { ok: false, message: "The end date must be on or after the start date." };
  return { ok: true, value: { from: fromMs, to: toMs } };
}

/** The window back as the two date-input values. */
export function vacationToDates(v: Vacation, tz: string): { from: string; to: string } {
  return { from: dateInputValue(v.from, tz), to: dateInputValue(v.to, tz) };
}

/** From today, To seven days later (in `tz`), as stored values. */
export function defaultVacation(nowMs: number, tz: string): Vacation {
  const today = zonedParts(nowMs, tz);
  const later = new Date(Date.UTC(today.year, today.month - 1, today.day + 7));
  const from = startOfDay(today, tz);
  const to = endOfDay(
    { year: later.getUTCFullYear(), month: later.getUTCMonth() + 1, day: later.getUTCDate() },
    tz
  );
  return { from, to };
}

/** "off" when nothing is set or the window is over; "upcoming" before it starts; "active" inside it. */
export function vacationState(v: Vacation | undefined, nowMs: number): VacationState {
  if (!v || v.to < nowMs) return "off";
  return v.from > nowMs ? "upcoming" : "active";
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 12 Oct" for an instant, in `tz`. */
export function shortDayText(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${WEEKDAY_SHORT[p.weekday]} ${p.day} ${MONTH_SHORT[p.month - 1]}`;
}

/** "Paused until Mon 12 Oct" while active; "Starts Fri 9 Oct, paused until Mon 12 Oct" before; "" when off. */
export function vacationText(v: Vacation | undefined, nowMs: number, tz: string): string {
  const state = vacationState(v, nowMs);
  if (!v || state === "off") return "";
  const until = `paused until ${shortDayText(v.to, tz)}`;
  return state === "active"
    ? `Paused until ${shortDayText(v.to, tz)}`
    : `Starts ${shortDayText(v.from, tz)}, ${until}`;
}

/* ---------- queue rules ---------- */

export type Rules = AppSettings["rules"];

export const EVERGREEN_REST_CHOICES = [7, 14, 21, 30, 45, 60, 90] as const;

/** The usual rest periods, plus the saved value when it is not one of them. */
export function evergreenOptions(saved: number): number[] {
  const set = new Set<number>(EVERGREEN_REST_CHOICES);
  set.add(saved);
  return [...set].sort((a, b) => a - b);
}

export function evergreenLabel(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The complete `rules` object with a change laid over it (fillGaps and the rest are kept). */
export function mergeRules(current: Rules, change: Partial<Omit<Rules, "dailyCap">>): Rules {
  return { ...current, ...change, dailyCap: { ...current.dailyCap } };
}

export function mergeDailyCap(current: Rules, platform: Platform, value: number): Rules {
  return { ...current, dailyCap: { ...current.dailyCap, [platform]: value } };
}

/** Meta's published daily limit for a platform: the most the founder's own cap can be. */
export function dailyCapLimit(platform: Platform): number {
  return META_DAILY_LIMITS[platform];
}

/** A typed cap as a whole number from 1 up to Meta's limit; null when it is not a number. */
export function clampDailyCap(raw: string | number, platform: Platform): number | null {
  const n = typeof raw === "number" ? raw : raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(dailyCapLimit(platform), Math.max(1, Math.round(n)));
}

/** The message for a cap that is not a number. */
export function dailyCapProblem(platform: Platform): string {
  return `Enter a whole number from 1 to ${dailyCapLimit(platform)}.`;
}

/** The note shown when a typed cap was brought back inside the allowed range. */
export function dailyCapClampNote(typed: string | number, saved: number, platform: Platform): string | null {
  const n = typeof typed === "number" ? typed : Number(typed);
  if (!Number.isFinite(n) || Math.round(n) === saved) return null;
  return saved === dailyCapLimit(platform)
    ? `Capped at ${saved}, Meta's limit for ${platform === "threads" ? "Threads" : "Instagram"}.`
    : `Saved as ${saved}. The cap is a whole number from 1 to ${dailyCapLimit(platform)}.`;
}
