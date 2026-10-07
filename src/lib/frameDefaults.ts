import {
  FIT_OF,
  KIND_LABEL,
  resolveFrameKey,
  setFrameDefault,
  type FormatDefaults,
  type SetupKind,
} from "../../convex/lib/formatSetup";
import type { FrameFit } from "./libraryBoard";

/**
 * Library rules for "which frame is the default for which format". The pure resolution lives in
 * convex/lib/formatSetup.ts; this adds what the frame editor and the frame cards need: the four
 * frame formats, the effective-default test, the toggle states and the voice object to save.
 * No React, no Convex calls.
 */

/** The formats that take a story frame (the blog draft takes none). */
export type FrameFormat = Exclude<SetupKind, "blog">;

export interface FrameFormatInfo {
  kind: FrameFormat;
  fit: FrameFit;
  /** "Threads", "Caption", "Reel script", "Carousel". */
  label: string;
}

export const FRAME_FORMATS: readonly FrameFormatInfo[] = (
  ["threads", "caption", "reel", "carousel"] as const
).map((kind) => ({ kind, fit: FIT_OF[kind] as FrameFit, label: KIND_LABEL[kind] }));

/** The `fits` a frame made for this format starts with. */
export function fitsForFormat(kind: FrameFormat): FrameFit[] {
  return [FIT_OF[kind] as FrameFit];
}

/** The format a frame's `fits` start with (Threads when it has none we know). */
export function formatOfFits(fits: readonly FrameFit[]): FrameFormat {
  return FRAME_FORMATS.find((f) => fits.includes(f.fit))?.kind ?? "threads";
}

/** What a beat is, for the helper line under "Beats". A carousel's beats are its slides. */
export function beatsHint(fits: readonly FrameFit[]): string {
  const only = fits.length === 1 ? fits[0] : null;
  if (only === "carousel") return "Each beat is one slide. 2 to 5 slides.";
  if (only === "thread") return "Each beat is one post in the thread. 2 to 5 beats.";
  if (only === "single") return "Each beat is one part of the caption. 2 to 5 beats.";
  if (only === "reel") return "Each beat is one moment of the script. 2 to 5 beats.";
  return "Each beat is one step of the story. 2 to 5 beats.";
}

/** "DEFAULT · THREADS", "DEFAULT · REEL SCRIPT": the chip on a frame card. */
export function defaultChipLabel(kind: SetupKind): string {
  return `DEFAULT · ${KIND_LABEL[kind].toUpperCase()}`;
}

interface FrameLike {
  key: string;
  isActive?: boolean;
  fits: readonly FrameFit[];
}

interface VoiceLike {
  defaultFrameKey?: string;
  formatDefaults?: FormatDefaults;
}

/**
 * The formats this frame is the EFFECTIVE default for, in display order: the saved pick, else the older
 * single default, else the seeded frame, exactly what a draft run would use (resolveFrameKey).
 */
export function effectiveDefaultKinds(
  frameKey: string,
  voice: VoiceLike | undefined,
  frames: readonly FrameLike[]
): FrameFormat[] {
  if (!voice) return [];
  return FRAME_FORMATS.filter(
    (f) =>
      resolveFrameKey({
        kind: f.kind,
        defaults: voice.formatDefaults,
        legacyDefaultKey: voice.defaultFrameKey,
        frames,
      }) === frameKey
  ).map((f) => f.kind);
}

export interface DefaultToggle {
  kind: FrameFormat;
  label: string;
  /** This frame is the effective default for the format. */
  on: boolean;
  /**
   * On, but only through the older single default (or the seeded frame): nothing is saved for this
   * format to clear. The toggle stays on until another frame is picked.
   */
  inherited: boolean;
}

/** One toggle per format the frame fits, in display order. */
export function defaultToggles(
  frame: { key: string; fits: readonly FrameFit[] },
  voice: VoiceLike | undefined,
  frames: readonly FrameLike[]
): DefaultToggle[] {
  const effective = effectiveDefaultKinds(frame.key, voice, frames);
  return FRAME_FORMATS.filter((f) => frame.fits.includes(f.fit)).map((f) => {
    const on = effective.includes(f.kind);
    const saved = voice?.formatDefaults?.[f.kind]?.frameKey === frame.key;
    return { kind: f.kind, label: f.label, on, inherited: on && !saved };
  });
}

/**
 * The COMPLETE voice section to send after a toggle (`settings.update` replaces a whole section). Turning
 * on replaces the format's earlier pick; turning off clears it only when this frame is the saved one. An
 * emptied `formatDefaults` is removed rather than sent as undefined.
 */
export function voiceWithFrameDefault<V extends VoiceLike>(
  voice: V,
  kind: FrameFormat,
  frameKey: string,
  on: boolean
): V {
  const next = setFrameDefault(voice.formatDefaults, kind, frameKey, on);
  const out: V = { ...voice };
  if (next === undefined) delete out.formatDefaults;
  else out.formatDefaults = next;
  return out;
}
