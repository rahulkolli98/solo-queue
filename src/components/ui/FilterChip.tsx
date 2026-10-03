"use client";

import type { ReactNode } from "react";

/** A pill toggle for filters (pillar chips, status filters). Pressed = active. */
export default function FilterChip({
  pressed,
  onClick,
  children,
  swatch,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional colour token name for the small square, e.g. "pillar-build". */
  swatch?: string;
}) {
  return (
    <button
      type="button"
      className={`sq-fchip${pressed ? " sq-fchip-on" : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {swatch && (
        <i
          className="sq-fchip-swatch"
          style={{ background: `var(--color-${swatch})` }}
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
