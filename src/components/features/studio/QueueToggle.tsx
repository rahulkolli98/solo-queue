"use client";

/**
 * "In this queue": whether this draft goes out when the founder presses Queue. On by default;
 * switching it off leaves the draft alone and stops it holding back the others (an unfinished
 * reel does not block the caption and carousel).
 */
export default function QueueToggle({
  included,
  onChange,
  what,
}: {
  included: boolean;
  onChange: (included: boolean) => void;
  /** "thread", "caption", "reel script", "carousel": names the draft for screen readers. */
  what: string;
}) {
  return (
    <label className="studio-qtoggle">
      <input
        type="checkbox"
        checked={included}
        aria-label={`Include the ${what} when I press Queue`}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="t-meta">{included ? "IN THIS QUEUE" : "LEFT OUT OF THIS QUEUE"}</span>
    </label>
  );
}
