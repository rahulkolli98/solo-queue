import { frameKeyFromName, PROPOSE_TEXT_MAX, PROPOSE_TEXT_MIN } from "../../convex/lib/frameProposal";
import { validateFrame, type FrameBeat, type FrameFit } from "../../convex/lib/framesModel";
import { FRAME_FORMATS, fitsForFormat, formatOfFits, type FrameFormat } from "./frameDefaults";

/**
 * The rules behind "Make a story frame": where the proposal comes from, the editable draft (beat limits),
 * what to send to `frameProposal.propose` and to `frames.save`, and the words for each step. No React, no
 * Convex calls; the component in components/features/frames/FrameProposer.tsx only wires these up.
 */

export type ProposerSource = "topic" | "post";

export const MIN_BEATS = 2;
export const MAX_BEATS = 5;
export const NAME_MAX = 60;
export const LABEL_MAX = 30;
export const HINT_MAX = 200;
export const POST_MIN = PROPOSE_TEXT_MIN;
export const POST_MAX = PROPOSE_TEXT_MAX;
/** The pillar colour a proposed frame is saved with (the founder can change it in the Library). */
export const PROPOSED_FRAME_COLOR = "pillar-build";

/** What the founder edits between "Propose beats" and "Save frame". */
export interface ProposalDraft {
  name: string;
  beats: FrameBeat[];
  format: FrameFormat;
}

/** "This topic" is the default whenever the topic is one of the choices. */
export function defaultSource(sources: readonly ProposerSource[]): ProposerSource {
  return sources.includes("topic") ? "topic" : "post";
}

/** The source choice shows only when there is something to choose between. */
export function showsSourceChoice(sources: readonly ProposerSource[]): boolean {
  return sources.includes("topic") && sources.includes("post");
}

export function sourceLabel(source: ProposerSource): string {
  return source === "topic" ? "This topic" : "A post I paste";
}

export function formatLabel(format: FrameFormat): string {
  return FRAME_FORMATS.find((f) => f.kind === format)?.label ?? "Threads";
}

/** The `fit` the backend takes for a format (threads is "thread", caption is "single", and so on). */
export function fitOfFormat(format: FrameFormat): FrameFit {
  return fitsForFormat(format)[0];
}

/** "123 / 6,000" under the paste box. */
export function postCountLabel(text: string): string {
  return `${text.length.toLocaleString("en-US")} / ${POST_MAX.toLocaleString("en-US")}`;
}

/** Whether "Propose beats" can be pressed: a topic needs nothing more, a post needs 20 characters. */
export function canPropose(input: { source: ProposerSource; text: string; busy: boolean; hasTopic?: boolean }): boolean {
  if (input.busy) return false;
  if (input.source === "topic") return input.hasTopic !== false;
  return input.text.trim().length >= POST_MIN;
}

export type ProposeArgs<T> = { fit: FrameFit; topicId: T } | { fit: FrameFit; text: string };

/** The arguments for `frameProposal.propose`: exactly one of topicId or text. */
export function proposeArgs<T>(input: { source: ProposerSource; format: FrameFormat; topicId?: T; text: string }): ProposeArgs<T> | null {
  const fit = fitOfFormat(input.format);
  if (input.source === "topic") return input.topicId === undefined ? null : { fit, topicId: input.topicId };
  return { fit, text: input.text.trim() };
}

/** The editable draft for what the backend proposed. */
export function draftFromProposal(res: { name: string; beats: readonly FrameBeat[]; fit: FrameFit }): ProposalDraft {
  return {
    name: res.name.slice(0, NAME_MAX),
    beats: res.beats.slice(0, MAX_BEATS).map((b) => ({ label: b.label.slice(0, LABEL_MAX), hint: b.hint.slice(0, HINT_MAX) })),
    format: formatOfFits([res.fit]),
  };
}

export function setName(draft: ProposalDraft, name: string): ProposalDraft {
  return { ...draft, name: name.slice(0, NAME_MAX) };
}

/** Changes one field of one beat, kept inside its length limit. An unknown index changes nothing. */
export function setBeat(draft: ProposalDraft, index: number, field: "label" | "hint", value: string): ProposalDraft {
  if (index < 0 || index >= draft.beats.length) return draft;
  const clipped = value.slice(0, field === "label" ? LABEL_MAX : HINT_MAX);
  return { ...draft, beats: draft.beats.map((b, i) => (i === index ? { ...b, [field]: clipped } : b)) };
}

export function canRemoveBeat(draft: ProposalDraft): boolean {
  return draft.beats.length > MIN_BEATS;
}

export function canAddBeat(draft: ProposalDraft): boolean {
  return draft.beats.length < MAX_BEATS;
}

export function removeBeat(draft: ProposalDraft, index: number): ProposalDraft {
  if (!canRemoveBeat(draft) || index < 0 || index >= draft.beats.length) return draft;
  return { ...draft, beats: draft.beats.filter((_, i) => i !== index) };
}

export function addBeat(draft: ProposalDraft): ProposalDraft {
  if (!canAddBeat(draft)) return draft;
  return { ...draft, beats: [...draft.beats, { label: "", hint: "" }] };
}

export interface SaveFrameArgs {
  key: string;
  name: string;
  beats: FrameBeat[];
  fits: FrameFit[];
  color: string;
}

/**
 * The arguments for `frames.save`, or the message to show when the draft is not a valid frame. The key
 * comes from the name and never collides with an existing frame.
 */
export function buildSaveArgs(
  draft: ProposalDraft,
  takenKeys: readonly string[],
  color: string = PROPOSED_FRAME_COLOR
): { ok: true; args: SaveFrameArgs } | { ok: false; message: string } {
  const candidate = {
    key: frameKeyFromName(draft.name, takenKeys),
    name: draft.name.trim(),
    beats: draft.beats.map((b) => ({ label: b.label.trim(), hint: b.hint.trim() })),
    fits: fitsForFormat(draft.format),
    color,
  };
  if (!candidate.name) return { ok: false, message: "Give the frame a name." };
  const blank = candidate.beats.findIndex((b) => !b.label);
  if (blank !== -1) return { ok: false, message: `Beat ${blank + 1} needs a name.` };
  const checked = validateFrame(candidate);
  if (!checked.ok) return { ok: false, message: checked.message };
  return { ok: true, args: candidate };
}

/** "Saved “Name”. It is in the Library and in Studio's list for Threads." */
export function savedMessage(name: string, format: FrameFormat): string {
  return `Saved “${name}”. It is in the Library and in Studio's list for ${formatLabel(format)}.`;
}

export function defaultButtonLabel(format: FrameFormat): string {
  return `Make it my default for ${formatLabel(format)}`;
}

/** Where "Open in Library" goes. */
export function libraryFrameHref(key: string): string {
  return `/library/frames?frame=${encodeURIComponent(key)}`;
}
