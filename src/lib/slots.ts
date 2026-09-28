export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-midnight start of the day containing `at`. */
export function startOfDay(at: number | Date): Date {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 7-day window starting at local midnight of `from`.
 * Used by the queue week view: columns are `days[0..6]`.
 */
export function weekWindow(from: number | Date): { start: Date; days: Date[] } {
  const start = startOfDay(from);
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(start.getTime() + i * DAY_MS)
  );
  return { start, days };
}

export interface SlotLike {
  scheduledAt: number;
}

/**
 * Forward coverage in whole days: consecutive local days starting today
 * that each contain at least one slot. The thinner platform queue governs,
 * so callers pass one platform's slots at a time.
 */
export function forwardCoverage(
  slots: SlotLike[],
  now: number = Date.now()
): number {
  let covered = 0;
  let dayStart = startOfDay(now).getTime();
  // Guard: never scan more than a year out (prevents infinite loop on
  // far-future slots when intermediate days are empty — actually the loop
  // below breaks on the first empty day, so this is just belt-and-braces).
  for (let i = 0; i < 366; i++) {
    const dayEnd = dayStart + DAY_MS;
    const hasSlot = slots.some(
      (s) => s.scheduledAt >= dayStart && s.scheduledAt < dayEnd
    );
    if (!hasSlot) break;
    covered++;
    dayStart = dayEnd;
  }
  return covered;
}
