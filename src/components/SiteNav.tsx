"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import { api } from "../../convex/_generated/api";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    />
  );
}

const TodayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
const StudioIcon = () => (
  <Icon strokeLinejoin="round">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);
const QueueIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);
const ResearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </Icon>
);
const LibraryIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  </Icon>
);
const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);

export default function SiteNav() {
  const pathname = usePathname();
  const threadsScheduled =
    useQuery(api.slots.countScheduledByPlatform, { platform: "threads" }) ??
    0;
  const igScheduled =
    useQuery(api.slots.countScheduledByPlatform, { platform: "instagram" }) ??
    0;
  const topicCount = useQuery(api.topics.count) ?? 0;
  const queueTotal = threadsScheduled + igScheduled;

  const items = [
    { href: "/", label: "Today", Icon: TodayIcon, badge: 0 },
    { href: "/studio", label: "Studio", Icon: StudioIcon, badge: 0 },
    { href: "/queue", label: "Queue", Icon: QueueIcon, badge: queueTotal },
    {
      href: "/research",
      label: "Research",
      Icon: ResearchIcon,
      badge: topicCount,
    },
    { href: "/library", label: "Library", Icon: LibraryIcon, badge: 0 },
  ];

  return (
    <nav aria-label="Primary" className="sq-nav">
      {items.map(({ href, label, Icon, badge }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="sq-nav-item"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            {label}
            {badge > 0 && <span className="sq-nav-badge">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsNavItem() {
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
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
          <span className="sq-muted">Loading…</span>
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
      <SettingsNavItem />
    </div>
  );
}
