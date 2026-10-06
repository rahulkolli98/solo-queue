/**
 * Time-zone aware slot planning. Slot times are wall-clock times in the
 * founder's time zone ("09:30" means 09:30 there, across DST changes), so
 * everything here converts between wall time and UTC through Intl. Pure and
 * unit-tested; weekdays are Mon = 0 to match appSettings.slotDays.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** "auto" (not resolved yet) or an unknown zone falls back to UTC. */
export function resolveTz(tz: string | undefined): string {
  if (!tz || tz === "auto") return "UTC";
  try {
    formatter(tz);
    return tz;
  } catch {
    return "UTC";
  }
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // Mon = 0 ... Sun = 6
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function zonedParts(ts: number, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: Math.max(0, WEEKDAYS.indexOf(get("weekday"))),
  };
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset of `tz` from UTC at `ts`, in ms (positive east of UTC). */
function offsetAt(ts: number, tz: string): number {
  const p = zonedParts(ts, tz);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wallAsUtc - Math.floor(ts / 60000) * 60000;
}

/** UTC timestamp of a wall-clock time in `tz`. In a DST gap it lands just after the gap. */
export function zonedWallToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  tz: string
): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = asUtc - offsetAt(asUtc, tz);
  return asUtc - offsetAt(first, tz);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface SlotPlan {
  /** HH:MM wall-clock times, any order. */
  times: string[];
  /** Allowed weekdays, Mon = 0. */
  days: number[];
  tz: string;
  /** Candidates must be strictly after this instant. */
  afterMs: number;
  /** scheduledAt values already used on this platform. */
  taken: number[];
  /** No more than this many slots on one local day (the founder's own daily cap). */
  maxPerDay?: number;
  /** Candidates inside this window are skipped (vacation mode). */
  vacation?: { from: number; to: number };
  /** Extra veto: a candidate for which this returns true is skipped (queue rules such as "one reel a day"). */
  reject?: (ts: number) => boolean;
  /** How many local days ahead to look. */
  horizonDays?: number;
}

/**
 * The earliest slot after `afterMs` that is on an allowed weekday, at one of
 * the times, not taken, not on a day that already holds `maxPerDay` slots and
 * not inside the vacation window. Throws when nothing fits in the horizon.
 */
export function nextFreeSlot(plan: SlotPlan): number {
  const times = plan.times.filter((t) => HHMM.test(t)).sort();
  if (times.length === 0) throw new Error("No slot times set. Add one in Settings, then try again.");
  if (plan.days.length === 0) throw new Error("No posting days set. Add one in Settings, then try again.");
  const busy = new Set(plan.taken.map((t) => Math.floor(t / 60000)));
  const perDay = new Map<string, number>();
  for (const t of plan.taken) {
    const k = dayKey(t, plan.tz);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const start = zonedParts(plan.afterMs, plan.tz);
  const horizon = plan.horizonDays ?? 400;
  // Walk local dates using UTC arithmetic on the calendar date (no DST issues).
  for (let i = 0; i < horizon; i++) {
    const cal = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    const wall = {
      year: cal.getUTCFullYear(),
      month: cal.getUTCMonth() + 1,
      day: cal.getUTCDate(),
    };
    const weekday = (cal.getUTCDay() + 6) % 7; // Sunday=0 -> Mon=0 ... Sun=6
    if (!plan.days.includes(weekday)) continue;
    const key = `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
    if (plan.maxPerDay !== undefined && (perDay.get(key) ?? 0) >= plan.maxPerDay) continue;
    for (const time of times) {
      const [hour, minute] = time.split(":").map(Number);
      const ts = zonedWallToUtc({ ...wall, hour, minute }, plan.tz);
      if (ts <= plan.afterMs) continue;
      if (busy.has(Math.floor(ts / 60000))) continue;
      if (plan.vacation && ts >= plan.vacation.from && ts <= plan.vacation.to) continue;
      if (plan.reject?.(ts)) continue;
      return ts;
    }
  }
  throw new Error("No free slot in the next year — clear some queue first.");
}
