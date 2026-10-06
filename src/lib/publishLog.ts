import { dayKey, zonedParts } from "../../convex/lib/zoned";

/** Pure helpers for the Publishing log screen (board 07l). */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "42s ago", "5 min ago", "3 h ago", "2 d ago" from an age in seconds. */
export function agoLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "just now";
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Minutes of silence before the heartbeat card raises the alarm (PRD, board 07l). convex/publishLog.ts HEARTBEAT_STALE_MS must equal this; a convex test checks it. */
export const HEARTBEAT_ALARM_MINUTES = 5;

export type HeartbeatView =
  | { kind: "never"; label: string; tag: string }
  | { kind: "running" | "dry-run" | "stale"; label: string; tag: string };

/**
 * What the heartbeat card shows. The publisher ticks every minute, so no beat
 * for a few minutes means it stopped. In dry-run the tick still beats but
 * posts nothing, which the tag says plainly.
 */
export function heartbeatView(
  heartbeat: { ageSeconds: number; stale: boolean } | null,
  mode: "live" | "dry-run"
): HeartbeatView {
  if (!heartbeat) return { kind: "never", label: "No beat yet", tag: "● Waiting" };
  if (heartbeat.stale) return { kind: "stale", label: agoLabel(heartbeat.ageSeconds), tag: "● Stopped" };
  if (mode === "dry-run") return { kind: "dry-run", label: agoLabel(heartbeat.ageSeconds), tag: "● Dry run" };
  return { kind: "running", label: agoLabel(heartbeat.ageSeconds), tag: "● Running" };
}

/** Width (0-100) of a usage meter; a tiny non-zero use still shows a sliver. */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0 || used <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((used / limit) * 100)));
}

/** "12:05" for today, "Thu 19:00" for another day, in the founder's zone. */
export function receiptTime(ts: number, nowMs: number, tz: string): string {
  const p = zonedParts(ts, tz);
  const hhmm = `${pad(p.hour)}:${pad(p.minute)}`;
  return dayKey(ts, tz) === dayKey(nowMs, tz) ? hhmm : `${WEEKDAYS[p.weekday]} ${hhmm}`;
}

/**
 * A plain next step for a failed or retried attempt, derived from the
 * provider's message. Null when there is nothing useful to add.
 */
export function nextStep(outcome: "success" | "retryable" | "permanent", message: string | null): string | null {
  if (outcome === "success" || !message) return null;
  const m = message.toLowerCase();
  if (m.includes("auth") || m.includes("reconnect") || m.includes("token")) {
    return "Reconnect the account in Settings, then retry the post.";
  }
  if (m.includes("not reachable") || m.includes("media") || m.includes("404")) {
    return "Replace the media, then retry. The slot is held.";
  }
  if (m.includes("limit") || m.includes("429") || m.includes("rate")) {
    return "Meta's daily limit was hit. The post waits and goes out when the window clears.";
  }
  if (m.includes("stopped while posting")) {
    return "Look at the account first. If the post is not there, retry it from the Queue.";
  }
  if (outcome === "permanent") return "Open the post in the Queue to retry or reschedule it.";
  return null;
}

export type OutcomeFilter = "all" | "success" | "retryable" | "permanent";

export const OUTCOME_FILTERS: { value: OutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "retryable", label: "Retryable" },
  { value: "permanent", label: "Permanent" },
];
