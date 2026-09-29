"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Today" },
  { href: "/studio", label: "Studio" },
  { href: "/queue", label: "Queue" },
  { href: "/connections", label: "Connections" },
];

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="sq-nav">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="sq-nav-item"
          data-active={pathname === item.href}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
