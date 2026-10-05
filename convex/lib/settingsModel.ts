import { z } from "zod";

/**
 * The typed settings singleton (table `appSettings`): defaults, per-section
 * validation and patch merging. Pure, so it is unit-tested without a backend.
 * Shapes mirror docs/prd.md section 3.
 */

export interface Pillar {
  key: string;
  name: string;
  color: string;
  description: string;
  targetShare: number;
  links: string[];
}

export interface AppSettings {
  slotDefaults: { threads: string[]; instagram: string[] };
  slotDays: { threads: number[]; instagram: number[] };
  timezone: string;
  naturalTiming: boolean;
  vacation?: { from: number; to: number };
  rules: {
    mixPillars: boolean;
    evergreenRestDays: number;
    fillGaps: "ask" | "auto" | "off";
    oneReelPerDay: boolean;
    pauseOnFailure: boolean;
    dailyCap: { threads: number; instagram: number };
  };
  voice: {
    description: string;
    learnedFromCount: number;
    defaultFrameKey: string;
    /** Posts in an AI-written thread (2 to 12). Unset or 0 follows the story frame. */
    defaultPostCount?: number;
    threadsTopicTag: "auto" | "off";
    igHashtagMax: number;
    signOff?: string;
    bannedWords: string[];
  };
  pillars: Pillar[];
  notifications: {
    tokenExpiring: boolean;
    postFailed: boolean;
    queueLow: boolean;
    postPublished: boolean;
    sundayDigest: boolean;
    quietHours?: string;
  };
  media: { cleanupAfterDays?: number; igCrop: "4:5" | "1:1" };
  dismissedNudges: string[];
}

/** Meta's published daily limits; the founder's own caps must stay at or under them. */
export const META_DAILY_LIMITS = { threads: 250, instagram: 100 } as const;

export const DEFAULT_SETTINGS: AppSettings = {
  slotDefaults: { threads: ["09:30", "13:00", "19:00"], instagram: ["12:00", "18:30"] },
  slotDays: { threads: [0, 1, 2, 3, 4, 5, 6], instagram: [0, 2, 4, 5, 6] },
  timezone: "auto",
  naturalTiming: true,
  rules: {
    mixPillars: true,
    evergreenRestDays: 30,
    fillGaps: "ask",
    oneReelPerDay: true,
    pauseOnFailure: true,
    dailyCap: { threads: 5, instagram: 3 },
  },
  voice: {
    description:
      "Dry founder. Short, concrete, slightly dry. Never motivational-poster; says what happened and what it cost.",
    learnedFromCount: 0,
    defaultFrameKey: "confession",
    threadsTopicTag: "auto",
    igHashtagMax: 5,
    bannedWords: ["game-changer", "crush it", "unlock", "delve"],
  },
  pillars: [
    {
      key: "build",
      name: "Build in public",
      color: "pillar-build",
      description: "What I shipped, what broke, what it cost.",
      targetShare: 40,
      links: ["flofield", "postship"],
    },
    {
      key: "tools",
      name: "AI & tools",
      color: "pillar-tools",
      description: "Tools and APIs I tested, with receipts.",
      targetShare: 30,
      links: [],
    },
    {
      key: "screen",
      name: "Movies & series",
      color: "pillar-screen",
      description: "What I watched and what it taught me about telling a story.",
      targetShare: 15,
      links: [],
    },
    {
      key: "craft",
      name: "Content craft",
      color: "pillar-craft",
      description: "Hooks, structure and voice, as I learn them.",
      targetShare: 15,
      links: [],
    },
  ],
  notifications: {
    tokenExpiring: true,
    postFailed: true,
    queueLow: true,
    postPublished: false,
    sundayDigest: false,
  },
  media: { igCrop: "4:5" },
  dismissedNudges: [],
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

/** Sorted, de-duplicated list of HH:MM times, at most 8 per platform. */
const timeList = z
  .array(hhmm)
  .max(8)
  .transform((list) => [...new Set(list)].sort());

const dayList = z
  .array(z.number().int().min(0).max(6))
  .transform((list) => [...new Set(list)].sort((a, b) => a - b));

function isValidTimezone(tz: string): boolean {
  if (tz === "auto") return true;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pillarSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, "Lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^pillar-[a-z]+$/, "Use a pillar color token"),
  description: z.string().max(200),
  targetShare: z.number().int().min(0).max(100),
  links: z.array(z.string().trim().min(1).max(40)).max(8),
});

/** Section schemas: `settings.update` validates exactly the sections a patch touches. */
export const sectionSchemas = {
  slotDefaults: z.object({ threads: timeList, instagram: timeList }),
  slotDays: z.object({ threads: dayList, instagram: dayList }),
  timezone: z.string().refine(isValidTimezone, "Unknown time zone"),
  naturalTiming: z.boolean(),
  vacation: z
    .object({ from: z.number(), to: z.number() })
    .refine((v) => v.to > v.from, "Vacation must end after it starts")
    .nullable(), // null clears it
  rules: z.object({
    mixPillars: z.boolean(),
    evergreenRestDays: z.number().int().min(0).max(365),
    fillGaps: z.enum(["ask", "auto", "off"]),
    oneReelPerDay: z.boolean(),
    pauseOnFailure: z.boolean(),
    dailyCap: z.object({
      threads: z.number().int().min(1).max(META_DAILY_LIMITS.threads),
      instagram: z.number().int().min(1).max(META_DAILY_LIMITS.instagram),
    }),
  }),
  voice: z.object({
    description: z.string().max(600),
    learnedFromCount: z.number().int().min(0),
    defaultFrameKey: z.string().min(1).max(60),
    defaultPostCount: z
      .number()
      .int()
      .refine((n) => n === 0 || (n >= 2 && n <= 12), "Thread length is 2 to 12 posts, or 0 to follow the story frame.")
      .optional(),
    threadsTopicTag: z.enum(["auto", "off"]),
    igHashtagMax: z.number().int().min(0).max(30),
    signOff: z.string().max(80).optional(),
    bannedWords: z
      .array(z.string().trim().toLowerCase().min(1).max(40))
      .max(50)
      .transform((list) => [...new Set(list)]),
  }),
  pillars: z
    .array(pillarSchema)
    .min(1)
    .max(6)
    .refine((list) => new Set(list.map((p) => p.key)).size === list.length, "Pillar keys must be unique"),
  notifications: z.object({
    tokenExpiring: z.boolean(),
    postFailed: z.boolean(),
    queueLow: z.boolean(),
    postPublished: z.boolean(),
    sundayDigest: z.boolean(),
    quietHours: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM-HH:MM")
      .optional(),
  }),
  media: z.object({
    cleanupAfterDays: z.number().int().min(1).max(365).optional(),
    igCrop: z.enum(["4:5", "1:1"]),
  }),
  dismissedNudges: z.array(z.string().max(40)).max(200),
} as const;

export type SectionKey = keyof typeof sectionSchemas;
export const SECTION_KEYS = Object.keys(sectionSchemas) as SectionKey[];

export type PatchResult =
  | { ok: true; settings: AppSettings }
  | { ok: false; section: string; message: string };

/**
 * Apply a patch (a subset of top-level sections) over the current settings.
 * Each touched section is replaced whole after validation; unknown sections
 * and invalid values are refused with the offending section named.
 */
export function applyPatch(current: AppSettings, patch: unknown): PatchResult {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, section: "patch", message: "Patch must be an object." };
  }
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in sectionSchemas)) {
      return { ok: false, section: key, message: `Unknown settings section "${key}".` };
    }
    const parsed = sectionSchemas[key as SectionKey].safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
      return { ok: false, section: key, message: `${issue.message}${where}` };
    }
    if (key === "vacation" && parsed.data === null) delete next.vacation;
    else next[key] = parsed.data;
  }
  return { ok: true, settings: next as unknown as AppSettings };
}

/** Pillar share of a content mix must be sensible: warns (does not refuse) when shares do not sum to 100. */
export function pillarShareTotal(pillars: Pillar[]): number {
  return pillars.reduce((sum, p) => sum + p.targetShare, 0);
}
