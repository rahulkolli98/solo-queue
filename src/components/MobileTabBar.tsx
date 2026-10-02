"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, badgeLabel, isActivePath } from "@/lib/nav";
import { NavIcon } from "@/components/ui/icons";
import { useNavCounts } from "@/components/useNavCounts";

/**
 * Phone navigation: the five destinations as a bottom tab bar (shown below
 * 768px by shell.css). Same items, order and live counts as the sidebar.
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <nav aria-label="Primary" className="sq-tabbar">
      {NAV_ITEMS.map(({ href, label, icon, badge }) => {
        const active = isActivePath(pathname, href);
        const count = badge ? badgeLabel(counts[badge]) : null;
        return (
          <Link
            key={href}
            href={href}
            className="sq-tab"
            data-active={active}
            aria-current={active ? "page" : undefined}
            aria-label={count ? `${label}, ${count}` : undefined}
          >
            <i>
              <NavIcon name={icon} />
            </i>
            {label}
            {count && <b aria-hidden="true">{count}</b>}
          </Link>
        );
      })}
    </nav>
  );
}
