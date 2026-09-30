"use client";

import { useState, type ReactNode } from "react";

/**
 * Card-styled collapsible section. Header is always visible (title + tag +
 * chevron); body mounts only when open.
 */
export default function CollapsibleSection({
  title,
  tag,
  defaultOpen = false,
  label,
  children,
}: {
  title: string;
  tag?: string;
  defaultOpen?: boolean;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="sq-card" aria-label={label}>
      <button
        type="button"
        className="sq-collapse-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sq-card-h" style={{ flexGrow: 1 }}>
          <h2 className="sq-card-title">{title}</h2>
          {tag && (
            <span className="sq-tag" style={{ marginLeft: "auto" }}>
              {tag}
            </span>
          )}
        </span>
        <span className="sq-chevron" data-open={open} aria-hidden="true">
          ›
        </span>
      </button>
      {open && <>{children}</>}
    </section>
  );
}
