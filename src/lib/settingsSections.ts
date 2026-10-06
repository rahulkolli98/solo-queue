/**
 * The Settings sections, in board order (docs/design boards 06, 06a-06h).
 * `key` is the URL slug: /settings/<key>. The groups are the phone list's
 * headings (MSettings): Accounts / Posting / Writing / You.
 */
export type SettingsGroup = "Accounts" | "Posting" | "Writing" | "You";

export interface SettingsSection {
  key: string;
  label: string;
  group: SettingsGroup;
  /** The serif line under the section heading. */
  blurb: string;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: "connections",
    label: "Connections",
    group: "Accounts",
    blurb: "Your own accounts, through Meta's official APIs.",
  },
  {
    key: "slots",
    label: "Posting slots",
    group: "Posting",
    blurb: "When each platform posts. Drafts drop into these.",
  },
  {
    key: "rules",
    label: "Queue rules",
    group: "Posting",
    blurb: "How the queue decides what goes out next.",
  },
  {
    key: "notifications",
    label: "Notifications",
    group: "Posting",
    blurb: "Only the things worth interrupting you for.",
  },
  {
    key: "voice",
    label: "Voice & writing",
    group: "Writing",
    blurb: "How drafts should sound before you touch them.",
  },
  {
    key: "pillars",
    label: "Content pillars",
    group: "Writing",
    blurb: "The themes your posts rotate through.",
  },
  {
    key: "media",
    label: "Media hosting",
    group: "You",
    blurb: "Where your images and videos live until they post.",
  },
  {
    key: "billing",
    label: "Plan & billing",
    group: "You",
    blurb: "One flat price. No per-post fees.",
  },
  {
    key: "data",
    label: "Data & account",
    group: "You",
    blurb: "Your posts are yours. Take them anywhere.",
  },
];

export const DEFAULT_SECTION = SETTINGS_SECTIONS[0].key;

export function findSection(key: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.key === key);
}

/** The section a pathname points at ("/settings/slots" → "slots"), or null. */
export function sectionFromPath(pathname: string): string | null {
  const m = /^\/settings\/([^/?#]+)\/?$/.exec(pathname);
  return m && findSection(m[1]) ? m[1] : null;
}

/** Sections grouped for the phone list, in order, empty groups dropped. */
export function groupedSections(): { group: SettingsGroup; items: SettingsSection[] }[] {
  const out: { group: SettingsGroup; items: SettingsSection[] }[] = [];
  for (const s of SETTINGS_SECTIONS) {
    const last = out[out.length - 1];
    if (last && last.group === s.group) last.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}

/**
 * The small mono text beside a nav item (board: "2", "5/DAY", "4"). Items
 * with nothing worth saying get "".
 */
export function navMeta(
  key: string,
  live: { connections?: number; slotsPerDay?: number; pillars?: number }
): string {
  if (key === "connections" && live.connections) return String(live.connections);
  if (key === "slots" && live.slotsPerDay) return `${live.slotsPerDay}/DAY`;
  if (key === "pillars" && live.pillars) return String(live.pillars);
  return "";
}
