"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { voiceWithFrameDefault, type FrameFormat } from "@/lib/frameDefaults";
import { refusalText } from "@/lib/refusalText";
import { api } from "../../../../convex/_generated/api";
import type { Voice } from "./types";

/**
 * The active story frames. A fresh database has none, so the first time the
 * list comes back empty this asks the backend to create the six defaults
 * (frames.ensureDefaults is safe to repeat).
 */
export function useFrames() {
  const frames = useQuery(api.frames.list);
  const ensureDefaults = useMutation(api.frames.ensureDefaults);
  const asked = useRef(false);

  useEffect(() => {
    if (frames !== undefined && frames.length === 0 && !asked.current) {
      asked.current = true;
      void ensureDefaults({});
    }
  }, [frames, ensureDefaults]);

  return frames;
}

/**
 * Saves "this frame is the default for <format>" (or clears it) into `settings.voice.formatDefaults`.
 * A settings patch replaces the whole voice section, so the complete current voice goes with it.
 * `setDefault` resolves true when saved; on a refusal `error` holds the text to show.
 */
export function useFrameDefaultSave() {
  const update = useMutation(api.settings.update);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDefault = useCallback(
    async (voice: Voice, kind: FrameFormat, frameKey: string, on: boolean): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await update({ patch: { voice: voiceWithFrameDefault(voice, kind, frameKey, on) } });
        return true;
      } catch (err) {
        setError(refusalText(err, "Could not save the default. Try again."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [update]
  );

  return { setDefault, busy, error };
}
