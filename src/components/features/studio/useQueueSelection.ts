"use client";

import { useState } from "react";
import type { DraftKind } from "@/lib/studioModel";

const KINDS: readonly DraftKind[] = ["threads", "caption", "reel", "carousel", "blog"];
const keyOf = (topicId: string) => `solo-queue:queue-off:${topicId}`;

function read(topicId: string): DraftKind[] {
  try {
    const raw = window.localStorage.getItem(keyOf(topicId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is DraftKind => KINDS.includes(k as DraftKind)) : [];
  } catch {
    return [];
  }
}

function write(topicId: string, off: DraftKind[]): void {
  try {
    window.localStorage.setItem(keyOf(topicId), JSON.stringify(off));
  } catch {
    // Private window or blocked storage: the choice still holds for this visit.
  }
}

/**
 * Which drafts of this topic the founder switched off for the queue. Everything is on until
 * switched off; the choice is remembered per topic in this browser.
 */
export function useQueueSelection(topicId: string) {
  const [state, setState] = useState<{ id: string; off: DraftKind[] }>(() => ({ id: topicId, off: read(topicId) }));
  // Another topic opened in the same mounted page: start from its own saved choice.
  if (state.id !== topicId) setState({ id: topicId, off: read(topicId) });
  const off = state.id === topicId ? state.off : [];

  function setIncluded(kind: DraftKind, included: boolean) {
    const next = included ? off.filter((k) => k !== kind) : off.includes(kind) ? off : [...off, kind];
    write(topicId, next);
    setState({ id: topicId, off: next });
  }

  return { off, setIncluded };
}
