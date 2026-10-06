"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { studioErrorText } from "@/lib/studioErrors";

export interface MediaActions {
  /** Draft or asset id currently being worked on. */
  busy: string | null;
  error: string | null;
  clearError: () => void;
  attach: (draftId: string, assetId: string | null) => Promise<boolean>;
  verify: (assetId: string) => Promise<boolean>;
}

/** Attach / detach media on a draft and verify an asset's URL. */
export function useMediaActions(): MediaActions {
  const attachMedia = useMutation(api.drafts.attachMedia);
  const verifyMedia = useAction(api.media.verify);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(studioErrorText(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    error,
    clearError: () => setError(null),
    attach: (draftId, assetId) =>
      run(
        draftId,
        () =>
          attachMedia({
            id: draftId as Id<"drafts">,
            mediaAssetId: assetId as Id<"mediaAssets"> | null,
          }),
        "Couldn't attach the media. Try again."
      ),
    verify: (assetId) =>
      run(assetId, () => verifyMedia({ id: assetId as Id<"mediaAssets"> }), "Couldn't verify that URL. Try again."),
  };
}
