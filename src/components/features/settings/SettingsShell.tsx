"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  groupedSections,
  navMeta,
  sectionFromPath,
  type SettingsSection,
} from "@/lib/settingsSections";

/**
 * Settings frame (board 06): the section list on the left, one section on
 * the right. On a phone the same list is the whole screen (grouped), and a
 * section opens full-screen with a back link; `data-view` tells the CSS which
 * of the two to show.
 */
export default function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = sectionFromPath(pathname);
  // Any /settings/<something> is a section view, even an unknown one (its not-found message must show).
  const inSection = /^\/settings\/[^/]+/.test(pathname);

  const connections = useQuery(api.connections.listPublic);
  const settings = useQuery(api.settings.get);
  const live = {
    connections: connections?.length,
    slotsPerDay: settings
      ? settings.slotDefaults.threads.length + settings.slotDefaults.instagram.length
      : undefined,
    pillars: settings?.pillars.length,
  };

  return (
    <div className="st-frame" data-view={inSection ? "section" : "index"}>
      <nav className="st-nav" aria-label="Settings sections">
        {groupedSections().map(({ group, items }) => (
          <div key={group} className="st-group">
            <h2 className="st-group-title">{group}</h2>
            {items.map((s) => (
              <NavLink key={s.key} section={s} active={active === s.key} meta={navMeta(s.key, live)} />
            ))}
          </div>
        ))}
        <div className="st-plan">
          <span className="st-plan-tag">PLAN</span>
          <strong>Solo · personal</strong>
          <span>Flat price. $0 per post.</span>
        </div>
      </nav>
      <div className="st-body">
        <Link href="/settings" className="st-back">
          <span aria-hidden="true">‹</span> Settings
        </Link>
        {children}
      </div>
    </div>
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
        ›
      </span>
    </Link>
  );
}
