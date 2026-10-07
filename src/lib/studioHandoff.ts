import { PLATFORM_NAME, shortDay, type Platform } from "@/lib/queueBoard";

/**
 * How other screens hand the founder to Studio with an explanation:
 * an open slot on the Queue board (`/studio?fillDay=..`) and a topic sent from
 * Research (`/studio/<id>?from=research`). The query only changes what Studio
 * SAYS; queueing is unchanged (posts still take the next free slots).
 */
export interface FillSlot {
  /** YYYY-MM-DD in the founder's zone, as the Queue board labels the day. */
  dayKey: string;
  /** HH:MM of the open slot, when the link names one. */
  time?: string;
  platform?: Platform;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `/studio?fillDay=2026-10-03&fillTime=09%3A30&fillOn=threads` */
export function studioFillHref(slot: FillSlot): string {
  const q = new URLSearchParams({ fillDay: slot.dayKey });
  if (slot.time) q.set("fillTime", slot.time);
  if (slot.platform) q.set("fillOn", slot.platform);
  return `/studio?${q.toString()}`;
}

type ParamValue = string | string[] | undefined;

function one(value: ParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The open slot a link names, or null when the query is absent or malformed. */
export function parseFillSlot(params: Record<string, ParamValue> | undefined): FillSlot | null {
  if (!params) return null;
  const dayKey = one(params.fillDay);
  if (!dayKey || !DAY.test(dayKey)) return null;
  const time = one(params.fillTime);
  const on = one(params.fillOn);
  return {
    dayKey,
    time: time && TIME.test(time) ? time : undefined,
    platform: on === "threads" || on === "instagram" ? on : undefined,
  };
}

/** "Sat 3 Oct, 09:30 on Threads" (parts the link did not name are left out). */
export function fillSlotLabel(slot: FillSlot): string {
  const day = shortDay(slot.dayKey);
  const when = slot.time ? `${day}, ${slot.time}` : day;
  return slot.platform ? `${when} on ${PLATFORM_NAME[slot.platform]}` : when;
}

/** The banner Studio shows when the founder arrives from an open slot. */
export function fillBanner(slot: FillSlot): { title: string; detail: string } {
  return {
    title: slot.time ? `Filling ${fillSlotLabel(slot)}.` : `Filling an open slot on ${shortDay(slot.dayKey)}.`,
    detail:
      "Pick a topic from your inbox below and press Draft or Write, or add a new one. When you queue, posts take the next free slots in order.",
  };
}

/** What happens after "Send to Studio" in Research. */
export const RESEARCH_HANDOFF_PARAM = "from";
export const RESEARCH_HANDOFF_VALUE = "research";

export function studioTopicHref(topicId: string, from?: "research"): string {
  return from ? `/studio/${topicId}?${RESEARCH_HANDOFF_PARAM}=${RESEARCH_HANDOFF_VALUE}` : `/studio/${topicId}`;
}

export function researchBanner(hasDrafts: boolean, hasBrief = false): { title: string; detail: string } {
  return hasDrafts
    ? {
        title: "Sent from Research.",
        detail:
          "Your thread is here as the Threads draft. Edit it here, attach media for Instagram if you want it, then press Queue posts.",
      }
    : {
        title: "Sent from Research.",
        detail:
          hasBrief
            ? "Press Generate drafts and your brief and sources are sent to the model, which writes the thread, Instagram reel script and caption from them. Or press Write it myself to write the thread yourself. Then you review, attach media and queue."
            : "Press Generate drafts and the thread, Instagram reel script and caption are written from this topic and its sources, or press Write it myself to write the thread yourself. Then you review, attach media and queue.",
      };
}

/**
 * "Draft this" on an angle card: Studio opens with only that angle's format ticked and its story frame picked.
 * The query names the angle's format and frame; it never starts the model (the founder presses Generate).
 */
export const ANGLE_PARAM = "angle";
export const ANGLE_FRAME_PARAM = "frame";

export interface AngleSetup {
  /** The Studio format the angle drafts. The carousel is not a Studio format yet. */
  kind: "threads" | "caption" | "reel";
  frameKey?: string;
}

const ANGLE_KINDS: readonly AngleSetup["kind"][] = ["threads", "caption", "reel"];
const FRAME_KEY = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * The Studio format an angle drafts. The platform decides: a "single" on Threads is one Threads post (the Threads
 * writer), a "single" on Instagram is a caption. The carousel is not a Studio format yet (null).
 */
export function angleSetup(angle: { platform?: string; format: string; frameKey: string }): AngleSetup | null {
  let kind: AngleSetup["kind"] | undefined;
  if (angle.format === "reel") kind = "reel";
  else if (angle.format === "caption") kind = "caption";
  else if (angle.format === "thread") kind = "threads";
  else if (angle.format === "single") kind = angle.platform === "instagram" ? "caption" : "threads";
  return kind ? { kind, frameKey: angle.frameKey } : null;
}

/** `/studio/<id>?from=research&angle=reel&frame=confession`, or null for a format Studio cannot draft yet. */
export function studioAngleHref(topicId: string, angle: { platform?: string; format: string; frameKey: string }): string | null {
  const setup = angleSetup(angle);
  if (!setup) return null;
  const q = new URLSearchParams({ [RESEARCH_HANDOFF_PARAM]: RESEARCH_HANDOFF_VALUE, [ANGLE_PARAM]: setup.kind });
  if (angle.frameKey && FRAME_KEY.test(angle.frameKey)) q.set(ANGLE_FRAME_PARAM, angle.frameKey);
  return `/studio/${topicId}?${q.toString()}`;
}

/** The angle a Studio link names (a Studio format and a frame), or null when the query has none or names an unknown format. */
export function parseAngle(params: { get: (name: string) => string | null }): AngleSetup | null {
  const kind = ANGLE_KINDS.find((k) => k === params.get(ANGLE_PARAM));
  if (!kind) return null;
  const frame = params.get(ANGLE_FRAME_PARAM);
  return { kind, frameKey: frame && FRAME_KEY.test(frame) ? frame : undefined };
}

/** What the Research banner says when the founder arrived from an angle card. */
export function angleBanner(label: string): { title: string; detail: string } {
  return {
    title: "Sent from Research.",
    detail: `Drafting just the ${label} for this angle. Press Generate, or open Change to add more formats.`,
  };
}
