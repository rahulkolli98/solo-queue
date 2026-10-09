"use client";

import {
  FORMAT_LABELS,
  LIBRARY_FORMATS,
  resultCount,
  sortOptions,
  type LibraryFormat,
  type LibrarySort,
  type TopicOption,
  type ViewFilters,
} from "@/lib/libraryView";
import type { LibraryFilters } from "./types";

/**
 * Sort, topic and format for a Library list, with how many items show and a way back to everything.
 * The search box, pillar and platform stay in the top bar.
 */
export default function LibraryControls({
  filters,
  onView,
  dateWord,
  topics,
  shown,
  total,
  noun,
  narrowed,
  onClear,
}: {
  filters: LibraryFilters;
  onView: (change: Partial<ViewFilters>) => void;
  /** What the dates mean here: "added" for drafts, "published" for the published list. */
  dateWord: "added" | "published";
  /** Topics that have items in this list, with their counts. */
  topics: TopicOption[];
  /** Items showing after every filter, and how many the list has before them. */
  shown: number;
  total: number;
  /** "draft" or "post". */
  noun: string;
  /** Any filter or search is narrowing the list. */
  narrowed: boolean;
  onClear: () => void;
}) {
  return (
    <div className="lb-controls" role="group" aria-label={`Sort and filter ${noun}s`}>
      <select
        className="lb-select"
        aria-label="Sort"
        value={filters.sort}
        onChange={(e) => onView({ sort: e.target.value as LibrarySort })}
      >
        {sortOptions(dateWord).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className="lb-select"
        aria-label="Filter by topic"
        value={filters.topicId}
        onChange={(e) => onView({ topicId: e.target.value })}
      >
        <option value="">Topic · All</option>
        {/* A topic from the address that has nothing in this list stays selectable, so the choice is visible. */}
        {filters.topicId && !topics.some((t) => t.id === filters.topicId) && (
          <option value={filters.topicId}>Topic · none here</option>
        )}
        {topics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ({t.count})
          </option>
        ))}
      </select>
      <select
        className="lb-select"
        aria-label="Filter by format"
        value={filters.format}
        onChange={(e) => onView({ format: e.target.value as LibraryFormat })}
      >
        <option value="">Format · All</option>
        {LIBRARY_FORMATS.filter((f) => dateWord === "added" || f !== "blog").map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>
      <span className="t-meta lb-count" role="status">
        {resultCount(shown, total, narrowed, noun).toUpperCase()}
      </span>
      {narrowed && (
        <button type="button" className="lb-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
