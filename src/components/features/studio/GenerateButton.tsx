"use client";

/**
 * The Generate button inside a panel: writes just this draft, so the founder does not have to
 * open the setup line. "Generate" with nothing written, "Regenerate" once there is a draft.
 */
export default function GenerateButton({
  has,
  busy,
  onClick,
  what,
  tone,
}: {
  /** A draft already exists, so this replaces it (Studio asks first if it has unsaved text). */
  has: boolean;
  /** Any generation is running: only one runs at a time. */
  busy: boolean;
  onClick: () => void;
  /** "thread", "caption", "reel script", "carousel", "blog draft": names the draft for screen readers. */
  what: string;
  /** "light" on the dark Threads column, "dark" for the main call to action on a light panel. */
  tone?: "light" | "dark";
}) {
  return (
    <button
      type="button"
      className={`sq-btn sq-btn-sm${tone ? ` sq-btn-${tone}` : ""} studio-gen-btn`}
      disabled={busy}
      aria-label={`${has ? "Regenerate" : "Generate"} the ${what}`}
      onClick={onClick}
    >
      {has ? "Regenerate" : "Generate"}
    </button>
  );
}
