import type { AppSettings } from "../../convex/lib/settingsModel";

export type Notifications = AppSettings["notifications"];
export type LiveKey = "tokenExpiring" | "postFailed" | "queueLow";
export type LaterKey = "postPublished" | "sundayDigest";

/** Alerts that already show on Today when switched on (board 06c, in-app only for v1). */
export const LIVE_ROWS: ReadonlyArray<{ key: LiveKey; title: string; help: string }> = [
  { key: "tokenExpiring", title: "Token expiring", help: "21 days before either token lapses." },
  { key: "postFailed", title: "Post failed", help: "Right away, with the reason from Meta." },
  { key: "queueLow", title: "Queue running low", help: "When fewer than 5 days are written." },
];

/** Kept on the board but not built yet: shown switched off and unavailable, never as a dead dial. */
export const LATER_ROWS: ReadonlyArray<{ key: LaterKey; title: string; help: string }> = [
  { key: "postPublished", title: "Post published", help: "A quiet confirmation for each post." },
  { key: "sundayDigest", title: "Sunday digest", help: "The week ahead, in one summary." },
];

/** The whole section with one alert flipped; every save sends the complete object. */
export function mergeNotifications(
  current: Notifications,
  change: Partial<Pick<Notifications, LiveKey>>
): Notifications {
  return { ...current, ...change };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "22:00-08:00" as two times, or null when none is saved or it is not valid. */
export function parseQuietHours(value: string | undefined): { from: string; to: string } | null {
  if (!value) return null;
  const [from, to] = value.split("-");
  return HHMM.test(from ?? "") && HHMM.test(to ?? "") ? { from, to } : null;
}

/** Validate a pair of times; the message is plain text for the inline error. */
export function quietHoursProblem(from: string, to: string): string | null {
  if (!HHMM.test(from) || !HHMM.test(to)) return "Pick both times, like 22:00 and 08:00.";
  if (from === to) return "Quiet hours need a start and an end that differ.";
  return null;
}

/** Save quiet hours; the saved string is HH:MM-HH:MM (it may cross midnight). */
export function withQuietHours(current: Notifications, from: string, to: string): Notifications {
  return { ...current, quietHours: `${from}-${to}` };
}

/** Clear quiet hours by leaving the optional field out. */
export function withoutQuietHours(current: Notifications): Notifications {
  const rest = { ...current };
  delete rest.quietHours;
  return rest;
}
