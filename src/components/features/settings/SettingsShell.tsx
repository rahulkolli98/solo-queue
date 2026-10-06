"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  SETTINGS_SECTIONS,
  groupedSections,
  navMeta,
  postingAsSummary,
  sectionFromPath,
  type SettingsSection,
} from "@/lib/settingsSections";

/**
 * Settings frame (board 06): the section list on the left, one section on
 * the right. On a phone the list is the whole screen, in the board's four
 * groups, and a section opens full-screen with a back button; `data-view`
 * tells the CSS which of the two to show. The desktop list is flat in board
 * order and the phone list is grouped, so both are rendered and CSS shows the
 * one that fits (the hidden one is out of the tab order and the a11y tree).
 */
export default function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = sectionFromPath(pathname);
  // Any /settings/<something> is a section view, even an unknown one (its not-found message must show).
  const inSection = /^\/settings\/[^/]+/.test(pathname);

  const connections = useQuery(api.connections.listPublic);
  const settings = useQuery(api.settings.get);
  const posting = postingAsSummary(connections);
  const live = {
    connections: connections?.length,
    slotsPerDay: settings
      ? settings.slotDefaults.threads.length + settings.slotDefaults.instagram.length
      : undefined,
    pillars: settings?.pillars.length,
  };

  return (
    <div className="st-frame" data-view={inSection ? "section" : "index"}>
      <nav className="st-nav st-nav-flat" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((s) => (
          <NavLink key={s.key} section={s} active={active === s.key} meta={navMeta(s.key, live)} />
        ))}
        <div className="st-plan">
          <span className="st-plan-tag">PLAN</span>
          <strong>Solo · personal</strong>
          <span>Flat price. $0 per post.</span>
        </div>
      </nav>
      {posting && (
        <section className="st-posting-as" aria-label="Posting as">
          <div className="st-posting-head">
            <span className="st-eyebrow">Posting as</span>
            <span className="st-posting-pill" data-health={posting.health}>
              ● {posting.label}
            </span>
          </div>
          <div className="st-posting-rows">
            {posting.rows.map((r) => (
              <span key={r.platform} className="st-posting-row">
                <span className={`st-posting-glyph st-posting-${r.platform}`} aria-hidden="true">
                  {r.platform === "threads" ? "@" : <InstagramGlyph />}
                </span>
                {r.handle}
              </span>
            ))}
          </div>
        </section>
      )}
      <nav className="st-nav st-nav-groups" aria-label="Settings sections">
        {groupedSections().map(({ group, items }) => (
          <div key={group} className="st-group">
            <h2 className="st-group-title">{group}</h2>
            <div className="st-group-card">
              {items.map((s) => (
                <NavLink key={s.key} section={s} active={active === s.key} meta={navMeta(s.key, live)} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="st-body">
        <Link href="/settings" className="st-back" aria-label="Back to settings">
          <span className="st-back-btn" aria-hidden="true">
            <ChevronLeft />
          </span>
          <span className="st-back-word" aria-hidden="true">
            SETTINGS
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function NavLink({
  section,
  active,
  meta,
}: {
  section: SettingsSection;
  active: boolean;
  meta: string;
}) {
  return (
    <Link
      href={`/settings/${section.key}`}
      className="st-link"
      aria-current={active ? "page" : undefined}
    >
      <span>{section.label}</span>
      {meta && <span className="st-link-meta">{meta}</span>}
      <span className="st-link-chev" aria-hidden="true">
        <ChevronRight />
      </span>
    </Link>
  );
}
