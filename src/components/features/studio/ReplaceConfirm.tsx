"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

/**
 * The one question asked before Generate / Regenerate / Retry replaces text the
 * founder already has. It sits inline (not a browser dialog): focus moves to
 * the safe answer, "Keep it", Escape also keeps, and the page hands focus back
 * to the button that was pressed when it closes.
 */
export default function ReplaceConfirm({
  message,
  onReplace,
  onKeep,
}: {
  message: string;
  onReplace: () => void;
  onKeep: () => void;
}) {
  const id = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onKeep();
    }
  }

  return (
    <div className="studio-confirm" role="group" aria-labelledby={id} onKeyDown={onKeyDown}>
      <p id={id} className="studio-confirm-text">
        {message}
      </p>
      <span className="studio-actions-row">
        <button type="button" className="sq-btn sq-btn-sm sq-btn-primary" onClick={onReplace}>
          Replace
        </button>
        <button type="button" className="sq-btn sq-btn-sm" ref={keepRef} onClick={onKeep}>
          Keep it
        </button>
      </span>
    </div>
  );
}
