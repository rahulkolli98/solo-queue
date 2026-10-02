"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useNow } from "@/lib/useNow";
import { openSlotChips, type OpenSlot } from "@/lib/studioModel";

/** Look this many days ahead for open slots and for already-queued posts of the topic. */
const DAYS_AHEAD = 14;

export function useOpenSlots() {
  const now = useNow();
  const browserTz = useBrowserTz();
  const board = useQuery(api.queueBoard.dayColumns, { from: now, days: DAYS_AHEAD, tz: browserTz });
  const chips: OpenSlot[] = board ? openSlotChips(board.days, 7) : [];
  return { board, chips, tz: board?.tz ?? browserTz, browserTz, now };
}
