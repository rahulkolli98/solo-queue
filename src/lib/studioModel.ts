/**
 * Derived state for the Studio screen: which draft is which, whether each is
 * ready to queue, what the bottom bar says, the open-slot chips and the
 * "Week queued" toast copy. Pure, so it is unit tested.
 */
import type { Doc } from "../../convex/_generated/dataModel";
import { VERIFIED_TTL_MS } from "../../convex/lib/slots";
import { findBannedWords } from "../../convex/lib/voiceRules";
import {
  CAPTION_LIMIT,
  THREADS_POST_LIMIT,
  charLen,
  parseThread,
  threadOverBy,
} from "@/lib/draftText";

export type DraftKind = "threads" | "caption" | "reel" | "carousel" | "blog";

/** The three formats `slots.queueTopic` can queue, in lane order. */
export const QUEUE_KINDS: readonly DraftKind[] = ["threads", "caption", "reel"];

/** The kinds this topic is queued with: the usual three, plus the carousel when the topic has one (most do not). */
export function queueKindsOf(states: Partial<Record<DraftKind, unknown>>): readonly DraftKind[] {
  return states.carousel ? [...QUEUE_KINDS, "carousel"] : QUEUE_KINDS;
}

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
  carousel: {
    templateKey: "carousel-slides",
    generateFormat: "instagram-carousel",
    label: "Carousel",
    noun: "carousel",
  },
  blog: {
    templateKey: "blog-draft",
    generateFormat: "blog",
    label: "Blog",
    noun: "blog draft",
  },
};

export type GenerateFormat = "threads" | "instagram-caption" | "instagram-reel" | "instagram-carousel" | "blog";

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

/**
 * The flag Studio shows on a draft that uses one of the founder's never-use
 * words: "NEVER-USE: unlock, delve", or null when it uses none. It is computed
 * from the live text and the live settings list, so editing either updates it.
 */
export function bannedWordsFlag(text: string, banned: readonly string[] | undefined): string | null {
  if (!banned || banned.length === 0) return null;
  const found = findBannedWords(text, [...banned]);
  return found.length > 0 ? `NEVER-USE: ${found.join(", ")}` : null;
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

/**
 * The media state of a carousel: it has one image per slide, all of them stored, and none checked too long ago.
 * `assets` are the library rows of its images (by id); an id with no row is a missing image.
 */
export function carouselMediaState(
  draft: { slides?: unknown[]; mediaAssetIds?: string[] } | undefined,
  assets: ReadonlyMap<string, Pick<Asset, "verifiedAt">>,
  now: number
): MediaState {
  const ids = draft?.mediaAssetIds ?? [];
  const slides = draft?.slides?.length ?? 0;
  if (slides === 0 || ids.length !== slides) return "none";
  const states = ids.map((id) => mediaState(id, assets.get(id), now));
  for (const worst of ["missing", "unverified", "stale"] as const) {
    if (states.includes(worst)) return worst;
  }
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
  if (input.kind === "caption" || input.kind === "carousel") {
    const over = charLen(input.body.trim()) - CAPTION_LIMIT;
    if (over > 0) return make("over", over);
  }
  if (input.kind === "caption" || input.kind === "reel" || input.kind === "carousel") {
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
  const kinds = queueKindsOf(input.states);
  const entries = kinds.map((k) => input.states[k]).filter((r): r is Readiness => Boolean(r));
  const written = entries.filter((r) => r.state !== "missing");
  const ready = entries.filter((r) => r.state === "ready").length;
  const queued = entries.filter((r) => r.state === "queued").length;
  const problems = entries.filter((r) => r.state !== "ready" && r.state !== "queued");
  const total = kinds.length;
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

// ---------- drafts that need a fix ----------

/** States that stop a draft being queued until the founder acts. ("missing" is not written yet, not a fault.) */
const BLOCKING: readonly ReadyState[] = [
  "over",
  "media_required",
  "media_missing",
  "media_unverified",
  "media_stale",
];

/**
 * The queueable drafts that need the founder before they can go: over the
 * limit, media missing / unchecked / stale, or a failed write (`errored` lists
 * the kinds whose generation failed and which have no draft to show).
 */
export function draftsNeedingFix(
  states: Partial<Record<DraftKind, Readiness>>,
  errored: readonly DraftKind[] = []
): DraftKind[] {
  return queueKindsOf(states).filter((kind) => {
    const state = states[kind]?.state;
    if (state && BLOCKING.includes(state)) return true;
    return errored.includes(kind) && (state === undefined || state === "missing");
  });
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "two" up to ten, the digit after that. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** The Studio headline when drafts need a fix: "two drafts need a" + "fix." (the accent). */
export function fixHeadline(count: number): { lead: string; accent: string } {
  return {
    lead: count === 1 ? "one draft needs a" : `${countWord(count)} drafts need a`,
    accent: "fix.",
  };
}

/** "Instagram: 2 drafts need you" on a phone (the other pane has the problem). */
export function platformNeedsText(platform: "Threads" | "Instagram", count: number): string {
  return `${platform}: ${count} ${count === 1 ? "draft needs" : "drafts need"} you`;
}

/** The Instagram column footer: "2 INSTAGRAM DRAFTS NEED YOU". */
export function instagramFooter(count: number): string {
  return `${count} INSTAGRAM ${count === 1 ? "DRAFT NEEDS" : "DRAFTS NEED"} YOU`;
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

// ---------- the guide: where you are and what to do next ----------

export type GuideStepKey = "topic" | "drafts" | "media" | "queue";

export interface GuideStep {
  key: GuideStepKey;
  /** "1" .. "4" */
  number: number;
  label: string;
  state: "done" | "current" | "todo";
}

export interface StudioGuide {
  steps: GuideStep[];
  /** One plain sentence: what to do next, and why Queue is (not) available. */
  text: string;
  /** "fix" = something blocks queueing, "wait" = work in progress, "go" = press the button, "done" = nothing left. */
  tone: "info" | "fix" | "wait" | "go" | "done";
}

export interface GuideInput {
  generating: boolean;
  /** A generation run failed and its error is showing. */
  generationFailed: boolean;
  states: Partial<Record<DraftKind, Readiness>>;
  /** 1-based number of the first Threads post over the limit. */
  firstOverPost?: number;
  /** Text typed in a "Write it myself" box that is not saved to the topic. */
  manualText: boolean;
  /** Any open slot in the next two weeks. */
  hasOpenSlot: boolean;
  /** The Threads column is showing the "Write it myself" boxes (nothing saved yet). */
  writerOpen?: boolean;
  /** The founder arrived from Research (`?from=research`), where the thread may already be written. */
  fromResearch?: boolean;
}

const IG_KINDS = ["reel", "caption"] as const;
const IG_NAME: Record<(typeof IG_KINDS)[number] | "carousel", string> = { reel: "reel", caption: "caption", carousel: "carousel" };
const MEDIA_STATES: ReadyState[] = ["media_required", "media_missing", "media_unverified", "media_stale"];

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The 4-step strip (Topic, Drafts, Media for Instagram, Queue) and the one
 * sentence that tells the founder what to do next. Pure, so every state is
 * unit tested; the sentence also explains why the Queue button is disabled.
 */
export function studioGuide(input: GuideInput): StudioGuide {
  const { states } = input;
  const at = (k: DraftKind): ReadyState => states[k]?.state ?? "missing";
  const kinds = queueKindsOf(states);
  const written = kinds.filter((k) => at(k) !== "missing");
  const queued = written.filter((k) => at(k) === "queued");
  const ready = kinds.filter((k) => at(k) === "ready");
  const readyN = ready.length;

  const draftsDone = written.length === kinds.length;
  const igWritten = (kinds.includes("carousel") ? ([...IG_KINDS, "carousel"] as const) : IG_KINDS).filter((k) => at(k) !== "missing");
  const mediaNeed = igWritten.filter((k) => MEDIA_STATES.includes(at(k)));
  const mediaDone = draftsDone && mediaNeed.length === 0;
  const queueDone = draftsDone && queued.length === written.length;

  const doneFlags = [true, draftsDone, mediaDone, queueDone];
  const firstTodo = doneFlags.findIndex((d) => !d);
  const steps: GuideStep[] = (
    [
      ["topic", "Topic"],
      ["drafts", "Drafts"],
      ["media", "Media for Instagram"],
      ["queue", "Queue"],
    ] as const
  ).map(([key, label], i) => ({
    key,
    number: i + 1,
    label,
    state: doneFlags[i] ? "done" : i === firstTodo ? "current" : "todo",
  }));

  const queueWord = `Queue ${readyN} ${plural(readyN, "post", "posts")}`;
  const made = (text: string, tone: StudioGuide["tone"]): StudioGuide => ({ steps, text, tone });

  if (input.generating) {
    return made("Writing your drafts. Stay on this page: each one appears as soon as it is written.", "wait");
  }
  if (written.length === 0) {
    if (input.manualText) {
      return made(
        "You have typed a draft that is not saved yet. Press Save draft to keep it with this topic. Then you can add media and queue it.",
        "fix"
      );
    }
    if (input.generationFailed) {
      return made("Drafting failed: the reason is shown above. Fix it and press Retry, or press Write it myself.", "fix");
    }
    if (input.writerOpen) {
      return made(
        "Write your thread in the boxes, then press Save draft. Or press Generate drafts and the model writes it.",
        "info"
      );
    }
    return made("Press Generate drafts, or press Write it myself to write the thread yourself.", "info");
  }
  if (queueDone) {
    return made("All queued. See the dates in the Queue; there is nothing left to do here.", "done");
  }

  // A thread that came from Research is already written: say so instead of asking for drafts.
  if (input.fromResearch && at("threads") === "ready") {
    const igNone = IG_KINDS.every((k) => at(k) === "missing");
    if (igNone) {
      return made(
        "Your thread from Research is here. Press Queue 1 post to queue it. To add Instagram too, press Generate drafts: it asks before it replaces your thread.",
        "go"
      );
    }
    if (draftsDone && mediaNeed.length > 0 && at("caption") !== "over") {
      return made(
        "Your thread from Research is here. Add media for Instagram if you want it, then press Queue posts.",
        "go"
      );
    }
  }

  // Problems, most urgent first.
  const fixes: string[] = [];
  if (at("threads") === "over") {
    fixes.push(
      input.firstOverPost
        ? `Over the ${THREADS_POST_LIMIT}-character limit on post ${input.firstOverPost}: use Trim to fit.`
        : `A post is over the ${THREADS_POST_LIMIT}-character limit: use Trim to fit.`
    );
  }
  if (at("caption") === "over") {
    fixes.push(`The caption is over the ${CAPTION_LIMIT.toLocaleString("en-GB")}-character limit: use Trim to fit.`);
  }
  const needsAttach = mediaNeed.filter((k) => at(k) === "media_required");
  const gone = mediaNeed.filter((k) => at(k) === "media_missing" && k !== "carousel");
  const unchecked = mediaNeed.filter((k) => at(k) === "media_unverified" && k !== "carousel");
  const stale = mediaNeed.filter((k) => at(k) === "media_stale" && k !== "carousel");
  const names = (ks: readonly ((typeof IG_KINDS)[number] | "carousel")[]) => listNames(ks.map((k) => IG_NAME[k]));
  const mediaLines: string[] = [];
  // A carousel's images are drawn in Studio, not attached from the library, so it has its own sentences.
  const carouselNeed = mediaNeed.find((k) => k === "carousel");
  const plainAttach = needsAttach.filter((k) => k !== "carousel");
  if (carouselNeed) {
    const cs = at("carousel");
    if (cs === "media_required") mediaLines.push("the carousel needs its images: open the Carousel tab and press Draw the slides");
    else if (cs === "media_missing") mediaLines.push("a slide image of the carousel is gone: press Draw the slides again");
    else mediaLines.push("press Check the images on the Carousel tab");
  }
  if (plainAttach.length > 0) {
    mediaLines.push(
      `Instagram needs media: attach a photo or video to the ${names(plainAttach)} (press Attach media and upload one right there, or pick one from the library)`
    );
  }
  if (gone.length > 0) mediaLines.push(`the media on the ${names(gone)} is gone: attach another`);
  if (unchecked.length > 0) mediaLines.push(`press Check on the ${names(unchecked)} media`);
  if (stale.length > 0) mediaLines.push(`press Recheck on the ${names(stale)} media, it was checked too long ago`);

  const missing = kinds.filter((k) => at(k) === "missing");
  const missingLine =
    missing.length > 0
      ? `The ${listNames(missing.map((k) => KIND_META[k].noun))} ${missing.length === 1 ? "is" : "are"} not written: press Generate drafts or Retry, or write ${missing.length === 1 ? "it" : "them"} yourself.`
      : "";

  if (fixes.length > 0 || mediaLines.length > 0 || missingLine) {
    const lead = at("threads") === "ready" && fixes.length === 0 ? "Your thread is ready. " : "";
    const media = mediaLines.length > 0 ? `${mediaLines.join("; ")}.` : "";
    const mediaText = media ? media.charAt(0).toUpperCase() + media.slice(1) : "";
    const tail = readyN > 0 ? ` Or press ${queueWord} now to queue only what is ready.` : "";
    const finish = !tail && mediaText && fixes.length === 0 && !missingLine ? " Then press Queue posts." : "";
    const text = [lead.trim(), ...fixes, mediaText, finish.trim(), missingLine, tail.trim()].filter(Boolean).join(" ");
    return made(text, "fix");
  }

  // Everything written is ready or already queued.
  if (!input.hasOpenSlot) {
    return made(
      `All set, but there is no open slot in the next 2 weeks. Open Settings to add posting times, then press ${queueWord}.`,
      "fix"
    );
  }
  return made(`All set: press ${queueWord}.`, "go");
}

/** What a story frame is, in one plain sentence (shown beside the picker). */
export const FRAME_EXPLAINER =
  "A story frame is the shape of the post, for example Confession: admit it, what it cost, the fix, the invite. Pick one, or leave the default.";

/** The guide on /studio before a topic is open: step 1 is the one to do. */
export function studioHomeGuide(hasInbox: boolean): StudioGuide {
  const labels: [GuideStepKey, string][] = [
    ["topic", "Topic"],
    ["drafts", "Drafts"],
    ["media", "Media for Instagram"],
    ["queue", "Queue"],
  ];
  return {
    steps: labels.map(([key, label], i) => ({ key, number: i + 1, label, state: i === 0 ? "current" : "todo" })),
    text: hasInbox
      ? "Type what the post is about, then press Save and draft both or Save and write it myself. Or pick a topic from your inbox and press Draft or Write."
      : "Type what the post is about, then press Save and draft both or Save and write it myself. Nothing is posted until you queue it.",
    tone: "info",
  };
}
