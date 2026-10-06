"use client";

import { useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import { THREADS_POST_LIMIT, charLen } from "@/lib/draftText";
import { removeConfirmText } from "@/lib/studioCompose";
import { bannedWordsFlag } from "@/lib/studioModel";

/**
 * One numbered post of the thread: editable text, beat label, N / 500 counter,
 * Trim / Split when over, and Up / Down / Remove. Removing a post that has
 * text asks once more (a second tap), so a stray click cannot lose it.
 */
export default function ThreadPostRow({
  index,
  text,
  beat,
  last,
  bannedWords,
  canRemove = true,
  onChange,
  onTrim,
  onSplit,
  onMove,
  onRemove,
}: {
  index: number;
  text: string;
  beat: string;
  last: boolean;
  /** The founder's never-use words: a post that uses one is flagged. */
  bannedWords?: readonly string[];
  /** False for the only post left: a thread keeps at least one. */
  canRemove?: boolean;
  onChange: (text: string) => void;
  onTrim: () => void;
  onSplit: () => void;
  /** Up (-1) or down (+1). Omit to hide the move buttons. */
  onMove?: (direction: -1 | 1) => void;
  onRemove?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const length = charLen(text.trim());
  const over = length - THREADS_POST_LIMIT;
  const banned = bannedWordsFlag(text, bannedWords);
  const n = index + 1;
  const id = `studio-post-${index}`;

  function remove() {
    if (text.trim() && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onRemove?.();
  }

  return (
    <div className="studio-post" data-over={over > 0 || undefined}>
      <div className="studio-rail">
        <span className="studio-num" data-first={index === 0 || undefined} data-over={over > 0 || undefined} aria-hidden="true">
          {n}
        </span>
        {!last && <i />}
      </div>
      <div className="studio-post-main">
        <AutoTextarea
          id={id}
          className="studio-textarea studio-textarea-post"
          aria-label={`Post ${n}, ${beat.toLowerCase()}`}
          value={text}
          onChange={(e) => onChange(e.target.value)}
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
        {banned && (
          <div className="studio-over">
            <span className="sq-pill sq-pill-ok">{banned}</span>
          </div>
        )}
        {(onMove || onRemove) && (
          <span className="studio-post-tools" role="group" aria-label={`Post ${n} actions`}>
            {onMove && (
              <>
                <button
                  type="button"
                  id={`${id}-up`}
                  className="studio-post-tool"
                  onClick={() => onMove(-1)}
                  disabled={index === 0}
                  aria-label={`Move post ${n} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  id={`${id}-down`}
                  className="studio-post-tool"
                  onClick={() => onMove(1)}
                  disabled={last}
                  aria-label={`Move post ${n} down`}
                >
                  Down
                </button>
              </>
            )}
            {onRemove && (
              <button
                type="button"
                id={`${id}-remove`}
                className="studio-post-tool studio-post-remove"
                onClick={remove}
                onBlur={() => setConfirming(false)}
                disabled={!canRemove}
                data-confirming={confirming || undefined}
                aria-label={confirming ? `Confirm removing post ${n}` : `Remove post ${n}`}
              >
                {confirming ? "Remove it?" : "Remove"}
              </button>
            )}
          </span>
        )}
        {/* A standing live region: the second-press question is spoken though the button keeps focus. */}
        <span className="sq-sr" role="status">
          {removeConfirmText(n, confirming)}
        </span>
      </div>
    </div>
  );
}
