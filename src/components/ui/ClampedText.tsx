"use client";

import { useId, useState, type ReactNode } from "react";
import { clampText, CLAMP_LIMIT } from "@/lib/clampText";

/**
 * Long text that shows its first ~280 characters with a "Show more" toggle. The caller
 * renders the text (so a quote keeps its quote marks and a brief keeps its paragraphs);
 * short text renders as it is, with no toggle. The toggle is a sibling of what `children`
 * draws, so it never sits inside a link.
 */
export default function ClampedText({
  text,
  limit = CLAMP_LIMIT,
  children,
}: {
  text: string;
  limit?: number;
  children: (shown: string) => ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const { short, clipped } = clampText(text, limit);
  if (!clipped) return <>{children(text)}</>;
  return (
    <>
      <div id={id} className="sq-clamped">
        {children(open ? text : `${short}…`)}
      </div>
      <button
        type="button"
        className="sq-showmore t-meta"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Show less" : "Show more"}
      </button>
    </>
  );
}
