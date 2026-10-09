"use client";

import { useState } from "react";
import type { DraftKind } from "@/lib/studioModel";

const KINDS: readonly DraftKind[] = ["threads", "caption", "reel", "carousel", "threadsCarousel", "blog"];
const keyOf = (topicId: string) => `solo-queue:queue-pick:${topicId}`;

/** The founder's explicit choices: true = in the queue, false = left out. A kind with no entry follows its default. */
type Picks = Partial<Record<DraftKind, boolean>>;

function read(topicId: string): Picks {
  try {
    const raw = window.localStorage.getItem(keyOf(topicId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Picks = {};
    for (const kind of KINDS) {
      const value = (parsed as Record<string, unknown>)[kind];
      if (typeof value === "boolean") out[kind] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function write(topicId: string, picks: Picks): void {
  try {
    window.localStorage.setItem(keyOf(topicId), JSON.stringify(picks));
  } catch {
    // Private window or blocked storage: the choice still holds for this visit.
  }
}

/**
 * Which drafts of this topic the founder chose to leave in or out of the queue. A draft with no choice follows its
 * default (in, unless the page says otherwise, for example a carousel set to post to Threads only). The choice is
 * remembered per topic in this browser.
 */
export function useQueueSelection(topicId: string) {
  const [state, setState] = useState<{ id: string; picks: Picks }>(() => ({ id: topicId, picks: read(topicId) }));
  // Another topic opened in the same mounted page: start from its own saved choice.
  if (state.id !== topicId) setState({ id: topicId, picks: read(topicId) });
  const picks = state.id === topicId ? state.picks : {};

  function setIncluded(kind: DraftKind, included: boolean) {
    const next = { ...picks, [kind]: included };
    write(topicId, next);
    setState({ id: topicId, picks: next });
  }

  /** The kinds explicitly left out, plus those a default leaves out that the founder did not turn back on. */
  function leftOut(defaultOff: readonly DraftKind[] = []): DraftKind[] {
    const out = new Set<DraftKind>(defaultOff.filter((k) => picks[k] !== true));
    for (const kind of KINDS) if (picks[kind] === false) out.add(kind);
    return [...out];
  }

  return { picks, setIncluded, leftOut };
}
