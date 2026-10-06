export type Platform = "threads" | "instagram";

export const PLATFORM_NAME: Record<Platform, string> = { threads: "Threads", instagram: "Instagram" };

/** Board mark for Instagram: a rounded square with a lens. Draws in the avatar's text colour. */
function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

/**
 * The platform's avatar on the Publishing log: "@" on a paper circle for Threads, the Instagram
 * glyph on coral. Decorative by default; pass `label` where it is the only thing naming the platform.
 */
export default function PlatformMark({ platform, label }: { platform: Platform; label?: boolean }) {
  return (
    <span
      className={`sq-avatar sq-log-mark ${platform === "threads" ? "sq-avatar-threads" : "sq-avatar-ig"}`}
      {...(label ? { role: "img", "aria-label": PLATFORM_NAME[platform] } : { "aria-hidden": true })}
    >
      {platform === "threads" ? "@" : <InstagramGlyph />}
    </span>
  );
}
