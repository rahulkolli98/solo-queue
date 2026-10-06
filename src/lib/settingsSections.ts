/**
 * The Settings sections, in desktop board order (docs/design boards 06,
 * 06a-06h). `key` is the URL slug: /settings/<key>. The groups are the phone
 * list's headings (MSettings): Accounts / Posting / Writing / You. The phone
 * list gathers each group's sections together, so a group's members need not
 * sit side by side here.
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
    group: "You",
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
    group: "Posting",
    blurb: "The four things you post about, and how often.",
  },
  {
    key: "media",
    label: "Media hosting",
    group: "Accounts",
    blurb: "Instagram publishes from a public link, so images and videos need a home.",
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

const GROUP_ORDER: readonly SettingsGroup[] = ["Accounts", "Posting", "Writing", "You"];

/**
 * Sections grouped for the phone list (Accounts, Posting, Writing, You), each
 * group collecting its sections wherever they sit in the flat desktop order.
 * Empty groups are dropped.
 */
export function groupedSections(): { group: SettingsGroup; items: SettingsSection[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: SETTINGS_SECTIONS.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);
}

/** What the phone list's "Posting as" card needs from a connection row. */
export interface PostingAsConnection {
  platform: "threads" | "instagram";
  handle?: string;
  status?: "healthy" | "expiring" | "failed";
}

/**
 * The phone list's "Posting as" card, from the connections already loaded:
 * one line per connected platform, and one word for how healthy they are.
 * Null when nothing is connected, so the card is left out.
 */
export function postingAsSummary(
  connections: readonly PostingAsConnection[] | undefined
): { rows: { platform: "threads" | "instagram"; handle: string }[]; health: "healthy" | "expiring" | "failed"; label: string } | null {
  if (!connections || connections.length === 0) return null;
  const ordered = (["threads", "instagram"] as const)
    .map((p) => connections.find((c) => c.platform === p))
    .filter((c): c is PostingAsConnection => c !== undefined);
  const health = ordered.some((c) => c.status === "failed")
    ? "failed"
    : ordered.some((c) => c.status === "expiring")
      ? "expiring"
      : "healthy";
  const label = health === "healthy" ? "ALL HEALTHY" : health === "expiring" ? "EXPIRING SOON" : "NEEDS ATTENTION";
  return { rows: ordered.map((c) => ({ platform: c.platform, handle: c.handle ?? "" })), health, label };
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
