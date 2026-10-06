import { platformNeedsText } from "@/lib/studioModel";

/**
 * Phones show one platform at a time. When the other one has drafts that need
 * the founder, this small card at the top of the visible one says so and
 * switches over. (Hidden on wide screens, where both columns are on show.)
 */
export default function PlatformNotice({
  platform,
  count,
  onOpen,
}: {
  /** The platform that has the problem (the one that is not showing). */
  platform: "Threads" | "Instagram";
  count: number;
  onOpen: () => void;
}) {
  return (
    <div className="studio-notice" role="status">
      <b className="studio-notice-text">{platformNeedsText(platform, count)}</b>
      <button
        type="button"
        className="sq-btn sq-btn-sm studio-notice-btn"
        aria-label={`Open ${platform}`}
        onClick={onOpen}
      >
        Open
      </button>
    </div>
  );
}
