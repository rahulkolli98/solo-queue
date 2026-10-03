import type { Platform } from "@/lib/queueBoard";

/** The platform mark used on lanes, cards and the Today notes: "@" disc for Threads, camera for Instagram. */
export default function PlatformGlyph({ platform, size = 26 }: { platform: Platform; size?: number }) {
  if (platform === "threads") {
    return (
      <span className="sq-glyph sq-glyph-threads" style={{ width: size, height: size, fontSize: size * 0.54 }} aria-hidden="true">
        @
      </span>
    );
  }
  return (
    <span className="sq-glyph sq-glyph-ig" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: size * 0.62, height: size * 0.62 }}>
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    </span>
  );
}
