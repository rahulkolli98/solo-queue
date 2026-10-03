"use client";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
}

/**
 * A row of mutually exclusive choices (Week / 3 weeks / Month, Threads /
 * Instagram, library tabs). Buttons with aria-pressed; the group is labelled.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
}) {
  return (
    <div className="sq-segs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`sq-seg${o.value === value ? " sq-seg-on" : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="sq-seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
