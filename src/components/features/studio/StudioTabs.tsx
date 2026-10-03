"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface StudioTab<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * A tablist (reel script / caption, the blog panel's four tabs) with roving
 * tabindex and Left / Right / Home / End. Render the panel yourself with
 * `role="tabpanel"` and `aria-labelledby={tabId(id)}`.
 */
export function useTabIds() {
  const base = useId();
  return {
    tabId: (id: string) => `${base}-tab-${id}`,
    panelId: (id: string) => `${base}-panel-${id}`,
  };
}

export default function StudioTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  tabId,
  panelId,
  className = "",
}: {
  tabs: StudioTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  tabId: (id: string) => string;
  panelId: (id: string) => string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === value);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    onChange(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div className={`sq-segs studio-tabs ${className}`.trim()} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          id={tabId(t.id)}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          aria-controls={panelId(t.id)}
          tabIndex={t.id === value ? 0 : -1}
          className={`sq-seg${t.id === value ? " sq-seg-on" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
