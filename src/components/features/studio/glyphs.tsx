/** Small marks only Studio uses: the Instagram avatar glyph and a chevron. */
export function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Round "@" avatar for Threads. */
export function ThreadsAvatar() {
  return (
    <span className="studio-av studio-av-threads" aria-hidden="true">
      @
    </span>
  );
}

export function InstagramAvatar() {
  return (
    <span className="studio-av studio-av-ig" aria-hidden="true">
      <InstagramGlyph />
    </span>
  );
}
