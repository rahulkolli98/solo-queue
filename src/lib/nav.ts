import type { IconKey } from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** Key into the live counts (see useNavCounts); items without one never show a badge. */
  badge?: "queue" | "research";
}

/** The five primary destinations, in order (sidebar and phone tab bar). */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/studio", label: "Studio", icon: "studio" },
  { href: "/queue", label: "Queue", icon: "queue", badge: "queue" },
  { href: "/research", label: "Research", icon: "research", badge: "research" },
  { href: "/library", label: "Library", icon: "library" },
];

/** True when `pathname` is `href` or lives under it. "/" matches only itself. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Short page name for the phone header; "" when the route has none. */
export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/log")) return "Publishing log";
  const hit = NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
  return hit?.label ?? "";
}

/** Badge text: nothing at zero, 99+ above two digits. */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}
