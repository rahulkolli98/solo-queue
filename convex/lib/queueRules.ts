/**
 * Pure helpers for the queue rules ("mix pillars", "one reel a day"). No I/O;
 * unit-tested in src/lib/queueRules.test.ts.
 */

/** The draft template that makes an Instagram post a reel. */
export const REEL_TEMPLATE_KEY = "reel-script";

export function isReelTemplate(templateKey: string | undefined): boolean {
  return templateKey === REEL_TEMPLATE_KEY;
}

/** A pillar key to compare: a topic without one counts as "build", as Today does. */
export function pillarOf(pillar: string | undefined | null): string {
  return pillar || "build";
}

export interface QueuedPillar {
  at: number;
  pillar: string;
}

/**
 * True when the slot at `ts` would sit next to a post of the same pillar:
 * the scheduled post just before it or just after it (in time, on the same
 * platform) belongs to `pillar`. `queue` need not be sorted.
 */
export function clashesWithNeighbour(queue: QueuedPillar[], ts: number, pillar: string): boolean {
  let prev: QueuedPillar | undefined;
  let next: QueuedPillar | undefined;
  for (const q of queue) {
    if (q.at < ts && (!prev || q.at > prev.at)) prev = q;
    else if (q.at > ts && (!next || q.at < next.at)) next = q;
  }
  return prev?.pillar === pillar || next?.pillar === pillar;
}
