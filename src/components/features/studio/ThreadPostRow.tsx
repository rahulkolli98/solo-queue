"use client";

import AutoTextarea from "@/components/features/studio/AutoTextarea";
import { THREADS_POST_LIMIT, charLen } from "@/lib/draftText";

/** One numbered post of the thread: editable text, beat label, N / 500 counter and Trim / Split when over. */
export default function ThreadPostRow({
  index,
  text,
  beat,
  last,
  onChange,
  onBlur,
  onTrim,
  onSplit,
}: {
  index: number;
  text: string;
  beat: string;
  last: boolean;
  onChange: (text: string) => void;
  onBlur: () => void;
  onTrim: () => void;
  onSplit: () => void;
}) {
  const length = charLen(text.trim());
  const over = length - THREADS_POST_LIMIT;
  return (
    <div className="studio-post" data-over={over > 0 || undefined}>
      <div className="studio-rail">
        <span className="studio-num" data-first={index === 0 || undefined} data-over={over > 0 || undefined} aria-hidden="true">
          {index + 1}
        </span>
        {!last && <i />}
      </div>
      <div className="studio-post-main">
        <AutoTextarea
          className="studio-textarea studio-textarea-post"
          aria-label={`Post ${index + 1}, ${beat.toLowerCase()}`}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {over > 0 ? (
          <div className="studio-over">
            <span className="sq-pill sq-pill-bad">
              {length} / {THREADS_POST_LIMIT} · OVER BY {over}
            </span>
            <button type="button" className="sq-btn sq-btn-sm sq-btn-light" onClick={onTrim}>
              Trim to fit
            </button>
            <button type="button" className="sq-btn sq-btn-sm sq-btn-light" onClick={onSplit}>
              Split in 2
            </button>
          </div>
        ) : (
          <span className="t-meta studio-post-meta">
            {beat} · {length} / {THREADS_POST_LIMIT}
          </span>
        )}
      </div>
    </div>
  );
}
