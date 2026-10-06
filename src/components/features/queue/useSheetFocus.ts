"use client";

import { useCallback, useEffect, useRef } from "react";
import { pickReturnFocus } from "@/lib/queueA11y";

/** The board control focus falls back to when the post's own card is gone (cancelled posts leave none). */
const FALLBACK = ".sq-q-rangectl [aria-pressed='true']";
const SLOT_ID = /^[A-Za-z0-9]+$/;

/**
 * Returns keyboard focus to where it was when the slot sheet closes. The sheet
 * is removed from the page when `?slot=` goes away, so the browser's own
 * restore does not run; this puts focus back on the card that opened it, the
 * same post's card if it was re-drawn (rescheduled), or the board's range
 * switch when the card is gone. Call `remember()` as the sheet opens.
 */
export function useSheetFocus(slotId: string | null): { remember: () => void } {
  const opener = useRef<HTMLElement | null>(null);
  const shown = useRef<string | null>(slotId);

  const remember = useCallback(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);

  useEffect(() => {
    const was = shown.current;
    shown.current = slotId;
    if (slotId !== null || was === null) return;
    const byId = SLOT_ID.test(was) ? document.querySelector<HTMLElement>(`[data-slot-id="${was}"]`) : null;
    const target = pickReturnFocus(opener.current, byId, document.querySelector<HTMLElement>(FALLBACK));
    opener.current = null;
    target?.focus();
  }, [slotId]);

  return { remember };
}
