"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../../../convex/_generated/api";

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
