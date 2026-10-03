/**
 * Derived state for the Studio screen: which draft is which, whether each is
 * ready to queue, what the bottom bar says, the open-slot chips and the
 * "Week queued" toast copy. Pure, so it is unit tested.
 */
import type { Doc } from "../../convex/_generated/dataModel";
import { VERIFIED_TTL_MS } from "../../convex/lib/slots";
import {
  CAPTION_LIMIT,
  THREADS_POST_LIMIT,
  charLen,
  parseThread,
  threadOverBy,
} from "@/lib/draftText";

export type DraftKind = "threads" | "caption" | "reel" | "blog";

/** The three formats `slots.queueTopic` can queue, in lane order. */
export const QUEUE_KINDS: readonly DraftKind[] = ["threads", "caption", "reel"];

export const KIND_META: Record<
  DraftKind,
  { templateKey: string; generateFormat: string; label: string; noun: string }
> = {
  threads: {
    templateKey: "threads-hook-story",
    generateFormat: "threads",
    label: "Threads",
    noun: "thread",
  },
  caption: {
    templateKey: "ig-caption-beats",
    generateFormat: "instagram-caption",
    label: "Caption",
    noun: "caption",
  },
  reel: {
    templateKey: "reel-script",
    generateFormat: "instagram-reel",
    label: "Reel script",
    noun: "reel script",
  },
  blog: {
    templateKey: "blog-draft",
    generateFormat: "blog",
    label: "Blog",
    noun: "blog draft",
  },
};

export type GenerateFormat = "threads" | "instagram-caption" | "instagram-reel" | "blog";

export function generateFormatOf(kind: DraftKind): GenerateFormat {
  return KIND_META[kind].generateFormat as GenerateFormat;
}

export type Draft = Doc<"drafts">;
export type Asset = Pick<Doc<"mediaAssets">, "_id" | "verifiedAt" | "mimeType" | "publicUrl"> &
  Partial<Pick<Doc<"mediaAssets">, "filename" | "lastVerifyError" | "createdAt">>;

/** The newest draft of each kind (drafts arrive oldest first; a later one replaces an earlier). */
export function latestByKind(drafts: Draft[]): Partial<Record<DraftKind, Draft>> {
  const byTemplate = new Map<string, Draft>();
  for (const d of [...drafts].sort((a, b) => a.createdAt - b.createdAt)) {
    byTemplate.set(d.templateKey, d);
  }
  const out: Partial<Record<DraftKind, Draft>> = {};
  for (const kind of Object.keys(KIND_META) as DraftKind[]) {
    const hit = byTemplate.get(KIND_META[kind].templateKey);
    if (hit) out[kind] = hit;
  }
  return out;
}

export type MediaState = "none" | "missing" | "unverified" | "stale" | "ok";

/** `asset` is undefined when the attached id is not in the library list. */
export function mediaState(
  mediaAssetId: string | undefined,
  asset: Pick<Asset, "verifiedAt"> | undefined,
  now: number
): MediaState {
  if (!mediaAssetId) return "none";
  if (!asset) return "missing";
  if (!asset.verifiedAt) return "unverified";
  if (now - asset.verifiedAt > VERIFIED_TTL_MS) return "stale";
  return "ok";
}

export type ReadyState =
  | "missing"
  | "ready"
  | "over"
  | "media_required"
  | "media_missing"
  | "media_unverified"
  | "media_stale"
  | "queued";

export interface Readiness {
  state: ReadyState;
  /** Characters past the limit (state "over"). */
  overBy: number;
  /** Short reason for the bar ("OVER LIMIT", "MEDIA MISSING"); empty when ready. */
  reason: string;
}

const REASON: Record<ReadyState, string> = {
  missing: "NOT WRITTEN",
  ready: "",
  over: "OVER LIMIT",
  media_required: "MEDIA MISSING",
  media_missing: "MEDIA MISSING",
  media_unverified: "MEDIA UNVERIFIED",
  media_stale: "MEDIA STALE",
  queued: "",
};

/** Is this draft, with its current text, good to queue? */
export function readiness(input: {
  kind: DraftKind;
  body: string | undefined;
  media: MediaState;
  queued?: boolean;
}): Readiness {
  const make = (state: ReadyState, overBy = 0): Readiness => ({ state, overBy, reason: REASON[state] });
  if (input.body === undefined || !input.body.trim()) return make("missing");
  if (input.queued) return make("queued");
  if (input.kind === "threads") {
    const over = threadOverBy(parseThread(input.body), THREADS_POST_LIMIT);
    if (over > 0) return make("over", over);
  }
  if (input.kind === "caption") {
    const over = charLen(input.body.trim()) - CAPTION_LIMIT;
    if (over > 0) return make("over", over);
  }
  if (input.kind === "caption" || input.kind === "reel") {
    if (input.media === "none") return make("media_required");
    if (input.media === "missing") return make("media_missing");
    if (input.media === "unverified") return make("media_unverified");
    if (input.media === "stale") return make("media_stale");
  }
  return make("ready");
}

export interface BarSummary {
  headline: string;
  sub: string;
  /** Drafts `slots.queueTopic` will take. */
  readyCount: number;
  needFixing: number;
  buttonLabel: string;
  canQueue: boolean;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** The bottom bar's left block and button label. */
export function barSummary(input: {
  states: Partial<Record<DraftKind, Readiness>>;
  generating: boolean;
  /** Drafts finished so far while generating, and how many are expected. */
  progress?: { done: number; total: number };
  /** Copy for the "nothing yet" state. */
  emptySub: string;
}): BarSummary {
  const entries = QUEUE_KINDS.map((k) => input.states[k]).filter((r): r is Readiness => Boolean(r));
  const written = entries.filter((r) => r.state !== "missing");
  const ready = entries.filter((r) => r.state === "ready").length;
  const queued = entries.filter((r) => r.state === "queued").length;
  const problems = entries.filter((r) => r.state !== "ready" && r.state !== "queued");
  const total = QUEUE_KINDS.length;
  const buttonLabel = ready > 0 ? `Queue ${ready} ${plural(ready, "post", "posts")}` : "Queue posts";

  if (input.generating) {
    const p = input.progress ?? { done: 0, total };
    return {
      headline: "Generating…",
      sub: `${p.done} OF ${p.total} DRAFTS READY`,
      readyCount: ready,
      needFixing: 0,
      buttonLabel,
      canQueue: false,
    };
  }
  if (written.length === 0) {
    return {
      headline: "No drafts yet",
      sub: input.emptySub,
      readyCount: 0,
      needFixing: 0,
      buttonLabel: "Queue posts",
      canQueue: false,
    };
  }
  if (problems.length === 0 && ready === 0 && queued > 0) {
    return {
      headline: "Week queued",
      sub: `${queued} ${plural(queued, "POST", "POSTS")} IN THE QUEUE`,
      readyCount: 0,
      needFixing: 0,
      buttonLabel: "Queue posts",
      canQueue: false,
    };
  }
  if (problems.length === 0) {
    const insta = (["caption", "reel"] as const).filter((k) => input.states[k]?.state === "ready").length;
    const mix = [
      input.states.threads?.state === "ready" ? "1 THREADS" : "",
      insta > 0 ? `${insta} INSTA` : "",
    ].filter(Boolean);
    return {
      headline: `${ready} ${plural(ready, "draft", "drafts")} ready`,
      sub: mix.join(" · "),
      readyCount: ready,
      needFixing: 0,
      buttonLabel,
      canQueue: ready > 0,
    };
  }
  const reasons = [...new Set(problems.map((r) => r.reason).filter(Boolean))];
  return {
    headline: `${ready} of ${total} ready`,
    sub: `${problems.length} NEED${problems.length === 1 ? "S" : ""} FIXING · ${reasons.join(", ")}`,
    readyCount: ready,
    needFixing: problems.length,
    buttonLabel,
    canQueue: ready > 0,
  };
}

// ---------- open slots ----------

export interface DayColumn {
  key: string;
  label: string;
  threads: unknown[];
  instagram: unknown[];
  open: { threads: string[]; instagram: string[] };
}

export interface OpenSlot {
  dayKey: string;
  /** "SAT 10" */
  dayLabel: string;
  platform: "threads" | "instagram";
  time: string;
  /** The platform has nothing scheduled that day. */
  gap: boolean;
  /** "SAT 10 OCT · 18:30" */
  when: string;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "SAT 10 OCT · 18:30" from a day column and an HH:MM. */
export function slotWhen(day: Pick<DayColumn, "key" | "label">, time: string): string {
  const month = MONTHS[Number(day.key.slice(5, 7)) - 1] ?? "";
  const [weekday, date] = day.label.split(" ");
  return `${weekday} ${date} ${month} · ${time}`;
}

/** The next open slots in time order across both platforms. */
export function openSlots(days: DayColumn[], limit = 7): OpenSlot[] {
  const out: OpenSlot[] = [];
  for (const day of days) {
    const here: OpenSlot[] = [];
    for (const platform of ["threads", "instagram"] as const) {
      for (const time of day.open[platform]) {
        here.push({
          dayKey: day.key,
          dayLabel: day.label,
          platform,
          time,
          gap: day[platform].length === 0,
          when: slotWhen(day, time),
        });
      }
    }
    here.sort((a, b) => a.time.localeCompare(b.time));
    out.push(...here);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/**
 * One chip per day for the next `limit` days that have an open slot: the
 * earliest slot that fills a gap (a platform with nothing that day), else the
 * earliest open slot. Days with no open slot are skipped.
 */
export function openSlotChips(days: DayColumn[], limit = 7): OpenSlot[] {
  const chips: OpenSlot[] = [];
  for (const day of days) {
    const slots = openSlots([day], 200);
    const pick = slots.find((s) => s.gap) ?? slots[0];
    if (pick) chips.push(pick);
    if (chips.length >= limit) break;
  }
  return chips;
}

/** The first open slot on a platform (the draft's likely target). */
export function nextOpen(days: DayColumn[], platform: "threads" | "instagram"): OpenSlot | undefined {
  return openSlots(days, 200).find((s) => s.platform === platform);
}

/** "TH 09:30" / "IG 18:30" for a chip. */
export function slotChipText(slot: Pick<OpenSlot, "platform" | "time">): string {
  return `${slot.platform === "threads" ? "TH" : "IG"} ${slot.time}`;
}

// ---------- queueing ----------

export interface QueueResult {
  queued: { format: string; templateKey: string; scheduledAt: number }[];
  skipped: { format: string; templateKey: string; code: string; message: string }[];
}

export interface WeekToast {
  title: string;
  detail?: string;
  tone: "ok" | "bad";
  /** A skipped draft needs media, so the toast offers "Attach media". */
  needsMedia: boolean;
  /** The kind to attach media to first. */
  mediaKind?: DraftKind;
}

const MEDIA_CODES = new Set(["MEDIA_REQUIRED", "MEDIA_MISSING", "MEDIA_UNVERIFIED", "MEDIA_STALE"]);

function kindOfTemplate(templateKey: string): DraftKind | undefined {
  return (Object.keys(KIND_META) as DraftKind[]).find((k) => KIND_META[k].templateKey === templateKey);
}

/** "Week queued: 4 Threads, 3 Instagram" plus the skipped detail. */
export function weekToast(result: QueueResult): WeekToast {
  const threads = result.queued.filter((q) => q.templateKey === KIND_META.threads.templateKey).length;
  const insta = result.queued.length - threads;
  const needsMediaSkip = result.skipped.find((s) => MEDIA_CODES.has(s.code));
  const skipText = result.skipped.map((s) => `${s.format}: ${s.message}`).join(" ");
  const detail = result.skipped.length
    ? `${result.skipped.length} skipped · ${skipText}`
    : undefined;
  const mediaKind = needsMediaSkip ? kindOfTemplate(needsMediaSkip.templateKey) : undefined;
  if (result.queued.length === 0) {
    return {
      title: "Nothing queued",
      detail,
      tone: "bad",
      needsMedia: Boolean(needsMediaSkip),
      mediaKind,
    };
  }
  return {
    title: `Week queued: ${threads} Threads, ${insta} Instagram`,
    detail,
    tone: "ok",
    needsMedia: Boolean(needsMediaSkip),
    mediaKind,
  };
}

// ---------- generation ----------

export interface GenerationProgress {
  done: number;
  total: number;
  /** Kinds already written in this run. */
  fresh: DraftKind[];
  /** The kind being written now (the first requested one not fresh). */
  current: DraftKind | null;
}

/**
 * Which requested kinds have landed since generation started. A draft is new
 * when its id was not present before the run began.
 */
export function generationProgress(
  requested: DraftKind[],
  latest: Partial<Record<DraftKind, Draft>>,
  beforeIds: ReadonlySet<string>
): GenerationProgress {
  const fresh = requested.filter((k) => {
    const d = latest[k];
    return d !== undefined && !beforeIds.has(d._id);
  });
  const current = requested.find((k) => !fresh.includes(k)) ?? null;
  return { done: fresh.length, total: requested.length, fresh, current };
}

/** "0:12" from elapsed milliseconds. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 24-hour "14:32" in a zone, for "Saved 14:32". */
export function formatClock(ts: number, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }).format(ts);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ts);
  }
}

/** Beat label for post `index` of a frame, falling back to "POST n". */
export function beatLabel(beats: { label: string }[] | undefined, index: number): string {
  const label = beats?.[index]?.label;
  return (label ?? `Post ${index + 1}`).toUpperCase();
}

/** "THU 15 OCT · 09:30" for a timestamp in a zone. */
export function formatWhen(ts: number, tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).formatToParts(ts);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", opts).formatToParts(ts);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} · ${get("hour")}:${get("minute")}`.toUpperCase();
}

export interface SaveLine {
  state: "idle" | "saving" | "dirty" | "saved" | "error";
  savedAt?: number;
}

/** The header's save status: "Saved 14:32", "Saving…", "Unsaved changes…". */
export function saveLabel(s: SaveLine, tz?: string): string {
  switch (s.state) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes…";
    case "error":
      return "Couldn't save";
    case "saved":
      return s.savedAt === undefined ? "Saved" : `Saved ${formatClock(s.savedAt, tz)}`;
    default:
      return "";
  }
}
