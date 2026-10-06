"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { AppSettings } from "../../../../convex/lib/settingsModel";
import { refusalText } from "@/lib/refusalText";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type SaveResult = { ok: true } | { ok: false; message: string };
export type SectionName = "voice" | "pillars";

/**
 * Save-on-change for one Settings section. `settings.update` replaces a whole
 * top-level section, so every save sends the COMPLETE section: the latest
 * saved value with `change` applied on top. Changes made while an earlier save
 * is still in flight build on that earlier change, not on the older value the
 * query still shows, so quick successive edits do not undo each other.
 */
export function useSectionSave<K extends SectionName>(name: K) {
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState("");

  const saved: AppSettings[K] | undefined = settings ? settings[name] : undefined;
  const base = useRef<AppSettings[K] | undefined>(saved);
  const inflight = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestSaved = useRef<AppSettings[K] | undefined>(saved);

  // Follow the server's value whenever nothing of ours is still being saved.
  useEffect(() => {
    latestSaved.current = saved;
    if (inflight.current === 0) base.current = saved;
  }, [saved]);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    []
  );

  const save = useCallback(
    async (change: (current: AppSettings[K]) => AppSettings[K]): Promise<SaveResult> => {
      const current = base.current;
      if (current === undefined) return { ok: false, message: "Settings are still loading. Try again in a moment." };
      const next = change(current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      base.current = next;
      inflight.current += 1;
      setStatus("saving");
      setMessage("");
      try {
        await update({ patch: { [name]: next } });
        // base already holds this change; the effect above re-syncs it with the server value.
        inflight.current -= 1;
        setStatus("saved");
        clearTimer.current = setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
        return { ok: true };
      } catch (err) {
        inflight.current -= 1;
        if (inflight.current === 0) base.current = latestSaved.current;
        const text = refusalText(err, "Couldn't save. Try again.");
        setStatus("error");
        setMessage(text);
        return { ok: false, message: text };
      }
    },
    [name, update]
  );

  return { settings, section: saved, status, message, save };
}

/** The words the polite status line shows for a save state. */
export function statusText(status: SaveStatus, message: string): string {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "error") return message || "Couldn't save. Try again.";
  return "";
}
