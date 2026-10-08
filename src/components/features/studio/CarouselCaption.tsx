"use client";

import { useMutation } from "convex/react";
import { useId, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { captionCount } from "@/lib/carouselEditor";
import { CAPTION_LIMIT, trimToFit } from "@/lib/draftText";
import { bannedWordsFlag } from "@/lib/studioModel";
import { studioErrorText } from "@/lib/studioErrors";

/** The Instagram caption of a carousel: saved on blur, with the character count, the limit and the never-use words. */
export default function CarouselCaption({
  draft,
  bannedWords,
}: {
  draft: Doc<"drafts">;
  bannedWords?: string[];
}) {
  const updateBody = useMutation(api.drafts.update);
  const id = useId();
  const [caption, setCaption] = useState(draft.body);
  const [seen, setSeen] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  if (draft.body !== seen) {
    // The server text changed: take it unless the founder has typed something not saved yet.
    setSeen(draft.body);
    if (caption === seen) setCaption(draft.body);
  }
  const count = captionCount(caption);
  const banned = bannedWordsFlag(caption, bannedWords);

  async function save(text: string) {
    if (text === draft.body) return;
    if (!text.trim()) {
      setError("The caption can't be empty.");
      return;
    }
    setError(null);
    try {
      await updateBody({ id: draft._id, body: text });
    } catch (e) {
      setError(studioErrorText(e, "Couldn't save the caption. Your text is still here. Try again."));
    }
  }

  return (
    <div className="studio-cr-caption">
      <div className="studio-caption-head">
        <label htmlFor={id} className="studio-cr-label">
          Instagram caption
        </label>
        <span className="t-meta">CAPTION · {count.label}</span>
        {banned && <span className="sq-pill sq-pill-ok">{banned}</span>}
        {count.over && (
          <>
            <span className="sq-pill sq-pill-bad">OVER BY {count.overBy}</span>
            <button
              type="button"
              className="sq-btn sq-btn-sm studio-cr-btn"
              onClick={() => {
                const fitted = trimToFit(caption, CAPTION_LIMIT);
                setCaption(fitted);
                void save(fitted);
              }}
            >
              Trim to fit
            </button>
          </>
        )}
      </div>
      <textarea
        id={id}
        className="sq-input studio-cr-caption-input"
        rows={6}
        value={caption}
        aria-invalid={count.over || undefined}
        aria-describedby={count.over ? `${id}-over` : undefined}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => void save(caption)}
      />
      {count.over && (
        <p id={`${id}-over`} className="studio-inline-error" role="alert">
          Over the limit: Instagram allows {CAPTION_LIMIT.toLocaleString("en-GB")} characters. Shorten the caption before
          you queue this carousel.
        </p>
      )}
      {error && (
        <p className="studio-inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
