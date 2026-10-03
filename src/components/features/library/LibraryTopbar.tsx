"use client";

import Link from "next/link";
import type { LibraryTab } from "@/lib/libraryBoard";
import type { LibraryFilters, Pillar } from "./types";

const TABS: { tab: LibraryTab; href: string; long: string; short: string }[] = [
  { tab: "published", href: "/library", long: "Published", short: "Published" },
  { tab: "drafts", href: "/library/drafts", long: "Drafts", short: "Drafts" },
  { tab: "frames", href: "/library/frames", long: "Story frames", short: "Frames" },
  { tab: "media", href: "/library/media", long: "Media", short: "Media" },
];

const SEARCH_LABEL: Record<LibraryTab, string> = {
  published: "Search everything you've written",
  drafts: "Search your drafts",
  frames: "Search your frames",
  media: "Search file names",
};

/** The tab links with live counts, plus search and the pillar / platform filters. */
export default function LibraryTopbar({
  tab,
  counts,
  filters,
  onFilters,
  pillars,
}: {
  tab: LibraryTab;
  counts: Partial<Record<LibraryTab, number>>;
  filters: LibraryFilters;
  onFilters: (next: LibraryFilters) => void;
  pillars: Pillar[];
}) {
  const showSelects = tab === "published" || tab === "drafts";
  return (
    <div className="lb-top">
      <nav className="lb-tabs" aria-label="Library section">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={t.href}
            className="lb-tab"
            aria-current={t.tab === tab ? "page" : undefined}
          >
            <span className="lb-tab-long">{t.long}</span>
            <span className="lb-tab-short">{t.short}</span>
            {counts[t.tab] !== undefined && <span className="lb-tab-count">{counts[t.tab]}</span>}
          </Link>
        ))}
      </nav>
      <div className="lb-tools">
        <label htmlFor="lb-search" className="sq-sr">
          {SEARCH_LABEL[tab]}
        </label>
        <input
          id="lb-search"
          type="search"
          className="lb-search"
          placeholder={SEARCH_LABEL[tab]}
          value={filters.search}
          onChange={(e) => onFilters({ ...filters, search: e.target.value })}
        />
        {showSelects && (
          <>
            <select
              className="lb-select"
              aria-label="Filter by pillar"
              value={filters.pillar}
              onChange={(e) => onFilters({ ...filters, pillar: e.target.value })}
            >
              <option value="">Pillar · All</option>
              {pillars.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="lb-select"
              aria-label="Filter by platform"
              value={filters.platform}
              onChange={(e) =>
                onFilters({ ...filters, platform: e.target.value as LibraryFilters["platform"] })
              }
            >
              <option value="">Platform · Both</option>
              <option value="threads">Threads</option>
              <option value="instagram">Instagram</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}
