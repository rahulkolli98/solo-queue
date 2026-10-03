"use client";

import { useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import { charLen } from "@/lib/draftText";

/**
 * "Write it myself": an empty editable area for a format the model failed to
 * write. Nothing is created on the server (there is no create call yet), so
 * the text stays on this page; Copy takes it with you.
 */
export default function ManualDraft({
  label,
  limit,
  autoFocus = true,
}: {
  label: string;
  limit?: number;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const length = charLen(text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="studio-manual">
      <label className="t-meta studio-manual-label" htmlFor={`manual-${label}`}>
        {label}
      </label>
      <AutoTextarea
        id={`manual-${label}`}
        className="studio-textarea studio-manual-field"
        value={text}
        autoFocus={autoFocus}
        placeholder="Write it here"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="studio-manual-foot">
        <span className="t-meta">
          {length}
          {limit ? ` / ${limit.toLocaleString("en-GB")}` : ""} · NOT SAVED TO THE TOPIC YET
        </span>
        <button type="button" className="sq-btn sq-btn-sm" onClick={() => void copy()} disabled={!text.trim()}>
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
