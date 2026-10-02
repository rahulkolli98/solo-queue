"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DraftSaver, summarizeSaves, type DraftStatus, type SaveSummary } from "@/lib/draftSaver";

const IDLE: DraftStatus = { state: "idle" };

export interface DraftEditor {
  /** Text to show: the local edit when there is one, else the server body. */
  valueFor: (id: string, serverBody: string) => string;
  change: (id: string, body: string) => void;
  flush: (id: string) => Promise<void>;
  flushAll: () => Promise<void>;
  /** True while any edit is unsaved (including one whose save just failed). */
  hasUnsaved: () => boolean;
  /** Drop local edits (after regenerate the server text wins). */
  discard: (id?: string) => void;
  statusFor: (id: string) => DraftStatus;
  summary: (ids: string[]) => SaveSummary;
}

/**
 * Inline draft editing with a debounced save (800 ms), a retry after failure,
 * a flush when the page is hidden or closed, and a flush on unmount, so edits
 * survive navigation. `save` is the `drafts.update` mutation.
 */
export function useDraftEditor(
  save: (id: string, body: string) => Promise<unknown>,
  describeError?: (e: unknown) => string
): DraftEditor {
  const [saver] = useState(() => new DraftSaver(describeError ? { save, describeError } : { save }));
  useEffect(() => {
    saver.setSave(save);
  }, [saver, save]);
  const snapshot = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);

  useEffect(() => {
    const onUnload = () => saver.flushOnUnload();
    const onHide = () => {
      if (document.visibilityState === "hidden") saver.flushOnUnload();
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onHide);
      void saver.flushAll();
    };
  }, [saver]);

  const valueFor = useCallback(
    (id: string, serverBody: string) => snapshot.edits[id] ?? serverBody,
    [snapshot]
  );
  const statusFor = useCallback((id: string) => snapshot.status[id] ?? IDLE, [snapshot]);
  const summary = useCallback((ids: string[]) => summarizeSaves(snapshot, ids), [snapshot]);

  return {
    valueFor,
    change: (id, body) => saver.change(id, body),
    flush: (id) => saver.flush(id),
    flushAll: () => saver.flushAll(),
    hasUnsaved: () => saver.hasPending(),
    discard: (id) => saver.discard(id),
    statusFor,
    summary,
  };
}
