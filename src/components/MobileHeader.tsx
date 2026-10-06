"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PublisherStatus from "@/components/PublisherStatus";
import { pageTitle } from "@/lib/nav";
import { PlusIcon, SettingsIcon } from "@/components/ui/icons";

/**
 * Compact phone header (shown below 768px by shell.css): Today shows the
 * wordmark; every other screen shows its own name as the heading, as on the
 * mobile boards (the tab bar links home).
 * Then Settings (the sidebar's Settings link has no phone equivalent) and
 * "New from topic".
 */
export default function MobileHeader() {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <header className="sq-mobile-header" data-home={pathname === "/" ? "true" : "false"}>
      <Link href="/" className="sq-mobile-brand">
        <span className="sq-mobile-wordmark">solo queue</span>
        <i aria-hidden="true" />
      </Link>
      {title && pathname !== "/" && <span className="sq-mobile-title">{title}</span>}
      <div className="sq-mobile-actions">
        <PublisherStatus compact />
        <Link href="/settings" className="sq-icon-btn" aria-label="Settings">
          <SettingsIcon />
        </Link>
        <Link
          href="/studio"
          className="sq-icon-btn sq-btn-primary"
          aria-label="New from topic"
        >
          <PlusIcon />
        </Link>
      </div>
    </header>
  );
}
