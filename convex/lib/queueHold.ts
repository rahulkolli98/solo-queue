/**
 * Pure rules that decide whether the publisher may claim a due post right
 * now: the vacation hold, the "pause on failure" hold and the natural-timing
 * delay. No I/O, so they are unit-tested (src/lib/queueHold.test.ts) and shared
 * by `slots.claimDue`, the tick's dry-run and logs, and the shell status.
 */

const DAY_MS = 86400000;

/** A failed post blocks the queue only while it is this recent: the same window Today's failed alert uses. */
export const FAILURE_WINDOW_MS = 14 * DAY_MS;

/** Natural timing never delays a post by 2 minutes or more, so it still lands inside the plus-or-minus 2 minute target. */
export const MAX_JITTER_MS = 120_000;

export type HoldReason = "vacation" | "failure" | null;

/** The same test Today uses for its failed alert: failed, and scheduled within the last 14 days. */
export function isUnresolvedFailure(slot: { status?: string; scheduledAt: number }, now: number): boolean {
  return (slot.status === undefined || slot.status === "failed") && slot.scheduledAt >= now - FAILURE_WINDOW_MS;
}

/**
 * Why nothing may be claimed right now, or null when posting can go ahead.
 * Vacation (inclusive of both ends) wins over a failure. `failedSlots` are
 * failed slots as read from the database; the 14 day window is applied here.
 */
export function holdReason(
  settings: { vacation?: { from: number; to: number }; rules: { pauseOnFailure: boolean } },
  failedSlots: { status?: string; scheduledAt: number }[],
  now: number
): HoldReason {
  const v = settings.vacation;
  if (v && now >= v.from && now <= v.to) return "vacation";
  if (settings.rules.pauseOnFailure && failedSlots.some((s) => isUnresolvedFailure({ ...s, status: "failed" }, now))) {
    return "failure";
  }
  return null;
}

/**
 * A small fixed delay, 0 up to (not including) 2 minutes, derived from the
 * slot id: the same slot always gets the same delay, so a post is never
 * "randomly" re-delayed on each tick. FNV-1a over the id.
 */
export function slotJitterMs(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % MAX_JITTER_MS;
}

/**
 * True while a post that is already due must still wait. Only a first attempt
 * is delayed (attempts is 0 and it was never rescheduled by a retry or a
 * release, so there is no originalScheduledAt); delay only, never early.
 */
export function isHeldByNaturalTiming(
  slot: { _id: string; scheduledAt: number; attempts: number; originalScheduledAt?: number },
  naturalTiming: boolean,
  now: number
): boolean {
  if (!naturalTiming) return false;
  if (slot.attempts !== 0 || slot.originalScheduledAt !== undefined) return false;
  return slot.scheduledAt + slotJitterMs(slot._id) > now;
}
