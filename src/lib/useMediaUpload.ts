"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { postFile, UploadCancelled, type UploadHandle } from "@/lib/mediaUpload";

export interface MediaUpload {
  /** Resolves with the new library asset. Rejects with UploadCancelled after cancel(). */
  done: Promise<Id<"mediaAssets">>;
  cancel: () => void;
}

/**
 * Upload a file into the media library: media.generateUploadUrl, POST to it,
 * then media.store. Progress is 0 to 100 for the POST. The caller checks the
 * file first (checkUploadFile in libraryBoard).
 */
export function useMediaUpload(): (file: File, onProgress: (percent: number) => void) => MediaUpload {
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const store = useMutation(api.media.store);

  return useCallback(
    (file, onProgress) => {
      let cancelled = false;
      let inner: UploadHandle | null = null;
      const done = (async () => {
        const url = await generateUploadUrl();
        if (cancelled) throw new UploadCancelled();
        inner = postFile(url, file, onProgress);
        const storageId = await inner.done;
        return await store({
          storageId: storageId as Id<"_storage">,
          mimeType: file.type,
          filename: file.name,
        });
      })();
      return {
        done,
        cancel: () => {
          cancelled = true;
          inner?.cancel();
        },
      };
    },
    [generateUploadUrl, store]
  );
}
