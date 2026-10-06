"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { NAV_ITEMS, badgeLabel, isActivePath } from "@/lib/nav";
import { NavIcon, SettingsIcon } from "@/components/ui/icons";
import PublisherStatus from "@/components/PublisherStatus";
import { useNavCounts } from "@/components/useNavCounts";

export default function SiteNav() {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <nav aria-label="Primary" className="sq-nav">
      {NAV_ITEMS.map(({ href, label, icon, badge }) => {
        const active = isActivePath(pathname, href);
        const count = badge ? badgeLabel(counts[badge]) : null;
        return (
          <Link
            key={href}
            href={href}
            className="sq-nav-item"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon name={icon} />
            {label}
            {count && <span className="sq-nav-badge">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsNavItem() {
  const pathname = usePathname();
  const active = isActivePath(pathname, "/settings");
  return (
    <Link
      href="/settings"
      className="sq-nav-item"
      data-active={active}
      aria-current={active ? "page" : undefined}
    >
      <SettingsIcon />
      Settings
    </Link>
  );
}

export function PostingAs() {
  const connections = useQuery(api.connections.listPublic);
  const threads = connections?.find((c) => c.platform === "threads");
  const instagram = connections?.find((c) => c.platform === "instagram");

  return (
    <div className="sq-accounts">
      <span className="sq-eyebrow">Posting as</span>
      <div className="sq-posting-card">
        {connections === undefined ? (
          <span className="sq-muted">Loading accounts…</span>
        ) : !threads && !instagram ? (
          <span className="sq-muted">Nothing connected yet.</span>
        ) : (
          <>
            {threads && (
              <span className="sq-row" style={{ gap: 10 }}>
                <span className="sq-avatar sq-avatar-threads" aria-hidden="true">
                  @
                </span>
                {threads.handle}
              </span>
            )}
            {instagram && (
              <span className="sq-row" style={{ gap: 10 }}>
                <span className="sq-avatar sq-avatar-ig" aria-hidden="true">
                  ▢
                </span>
                {instagram.handle}
              </span>
            )}
          </>
        )}
      </div>
      <PublisherStatus />
      <SettingsNavItem />
    </div>
  );
}
