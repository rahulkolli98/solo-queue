import type { CSSProperties, ReactNode } from "react";

type Tone = "light" | "dark" | "yellow";

const TONE_CLASS: Record<Tone, string> = {
  light: "",
  dark: " sq-sk-dk",
  yellow: " sq-sk-y",
};

export interface SkeletonProps {
  /** Width: a number is px, a string is any CSS length ("62%"). Default 100%. */
  w?: number | string;
  h?: number | string;
  /** Corner radius in px; default 8. */
  r?: number;
  /** "light" on cream and paper, "dark" on espresso, "yellow" on yellow cards. */
  tone?: Tone;
  /** Tilt in degrees, for the paper notes and postcards the real screen tilts. */
  rot?: number;
}

/** One blank shape of a loading layout. Decorative: the region announces loading, not its parts. */
export default function Skeleton({ w = "100%", h = 14, r, tone = "light", rot }: SkeletonProps) {
  const style: CSSProperties = { width: w, height: h };
  if (r !== undefined) style.borderRadius = r;
  if (rot !== undefined) style.transform = `rotate(${rot}deg)`;
  return (
    <span
      className={`sq-sk${TONE_CLASS[tone]}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/**
 * Wraps a screen's loading layout: marks the region busy and gives screen
 * readers one polite "Loading Today…" instead of dozens of blank shapes.
 */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className="sq-loading">
      <span className="sq-sr" role="status">
        {label}
      </span>
      {children}
    </div>
  );
}
