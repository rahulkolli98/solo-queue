/**
 * How the Library's Drafts and Published lists are narrowed and ordered: topic, format, sort, and the
 * URL that remembers them. Pure, so it is unit tested.
 */

export type LibrarySort = "newest" | "oldest" | "topic" | "platform";
export const LIBRARY_SORTS: readonly LibrarySort[] = ["newest", "oldest", "topic", "platform"];

export type LibraryFormat = "" | "thread" | "single" | "caption" | "reel" | "carousel" | "blog";
export const LIBRARY_FORMATS: readonly Exclude<LibraryFormat, "">[] = ["thread", "single", "caption", "reel", "carousel", "blog"];
export const FORMAT_LABELS: Record<Exclude<LibraryFormat, "">, string> = {
  thread: "Thread",
  single: "Single post",
  caption: "Caption",
  reel: "Reel script",
  carousel: "Carousel",
  blog: "Blog draft",
};

/** What the founder can narrow by, beyond the search box and the pillar and platform selects. */
export interface ViewFilters {
  /** A topic id, or "" for every topic. */
  topicId: string;
  format: LibraryFormat;
  sort: LibrarySort;
  pillar: string;
  platform: "" | "threads" | "instagram";
}

export const DEFAULT_SORT: LibrarySort = "newest";

/** Sort choices as the select shows them; the first is the default, named for what the tab's dates mean. */
export function sortOptions(dateWord: "added" | "published"): { value: LibrarySort; label: string }[] {
  return [
    { value: "newest", label: dateWord === "added" ? "Recently added" : "Recently published" },
    { value: "oldest", label: dateWord === "added" ? "Oldest first" : "Oldest published" },
    { value: "topic", label: "Topic A to Z" },
    { value: "platform", label: "Platform" },
  ];
}

interface Viewable {
  platform: "threads" | "instagram" | "blog";
  format: string | null;
  topicId: string;
  topicTitle: string;
}

/** The format an item counts as for the Format filter: a blog draft is "blog" whatever its format field says. */
export function formatOf(item: Pick<Viewable, "platform" | "format">): LibraryFormat {
  if (item.platform === "blog" || item.format === "blog") return "blog";
  const f = item.format ?? (item.platform === "threads" ? "thread" : "");
  return (LIBRARY_FORMATS as readonly string[]).includes(f) ? (f as LibraryFormat) : "";
}

/** Narrow by topic and format (the other filters are applied by the tabs). An empty value means "all". */
export function narrowBy<T extends Viewable>(items: T[], by: Pick<ViewFilters, "topicId" | "format">): T[] {
  return items.filter((i) => (!by.topicId || i.topicId === by.topicId) && (!by.format || formatOf(i) === by.format));
}

const PLATFORM_ORDER: Record<string, number> = { threads: 0, instagram: 1, blog: 2 };

/** A new array in the chosen order. Ties keep the newest first, so the order never jumps around. */
export function sortItems<T extends Viewable>(items: T[], sort: LibrarySort, when: (item: T) => number): T[] {
  const newestFirst = (a: T, b: T) => when(b) - when(a);
  const compare: Record<LibrarySort, (a: T, b: T) => number> = {
    newest: newestFirst,
    oldest: (a, b) => when(a) - when(b),
    topic: (a, b) => a.topicTitle.localeCompare(b.topicTitle, undefined, { sensitivity: "base" }) || newestFirst(a, b),
    platform: (a, b) => (PLATFORM_ORDER[a.platform] ?? 9) - (PLATFORM_ORDER[b.platform] ?? 9) || newestFirst(a, b),
  };
  return [...items].sort(compare[sort]);
}

export interface TopicOption {
  id: string;
  title: string;
  count: number;
}

/** The topics that have at least one item, A to Z, with how many. */
export function topicOptions(items: Pick<Viewable, "topicId" | "topicTitle">[]): TopicOption[] {
  const byId = new Map<string, TopicOption>();
  for (const i of items) {
    const hit = byId.get(i.topicId);
    if (hit) hit.count += 1;
    else byId.set(i.topicId, { id: i.topicId, title: i.topicTitle, count: 1 });
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

/** "12 of 40 drafts" while narrowed, "40 drafts" otherwise. */
export function resultCount(shown: number, total: number, narrowed: boolean, noun: string): string {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return narrowed ? `${shown} of ${plural(total)}` : plural(total);
}

// ---------- the URL ----------

const PARAMS = ["sort", "topic", "format", "pillar", "platform"] as const;

/** Read the view from a query string; anything unknown falls back to the default. */
export function viewFromParams(params: { get: (key: string) => string | null }): ViewFilters {
  const sort = params.get("sort");
  const format = params.get("format");
  const platform = params.get("platform");
  return {
    sort: (LIBRARY_SORTS as readonly string[]).includes(sort ?? "") ? (sort as LibrarySort) : DEFAULT_SORT,
    topicId: params.get("topic") ?? "",
    format: (LIBRARY_FORMATS as readonly string[]).includes(format ?? "") ? (format as LibraryFormat) : "",
    pillar: params.get("pillar") ?? "",
    platform: platform === "threads" || platform === "instagram" ? platform : "",
  };
}

/**
 * The query string for this view, keeping any other parameter already in `current` (the frame being edited,
 * for example). Defaults are left out so the plain address stays plain. Returns "" or a string starting "?".
 */
export function paramsForView(current: string, view: ViewFilters): string {
  const next = new URLSearchParams(current);
  for (const key of PARAMS) next.delete(key);
  if (view.sort !== DEFAULT_SORT) next.set("sort", view.sort);
  if (view.topicId) next.set("topic", view.topicId);
  if (view.format) next.set("format", view.format);
  if (view.pillar) next.set("pillar", view.pillar);
  if (view.platform) next.set("platform", view.platform);
  const text = next.toString();
  return text ? `?${text}` : "";
}
