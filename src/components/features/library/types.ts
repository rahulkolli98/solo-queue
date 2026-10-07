import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { AppSettings, Pillar } from "../../../../convex/lib/settingsModel";

export type PublishedPost = FunctionReturnType<typeof api.library.published>[number];
export type DraftCard = FunctionReturnType<typeof api.library.drafts>["cards"][number];
export type Frame = FunctionReturnType<typeof api.frames.list>[number];
export type MediaAsset = FunctionReturnType<typeof api.media.list>[number];
export type Voice = AppSettings["voice"];
export type { Pillar };

/** The filters in the top bar. Empty strings mean "all". */
export interface LibraryFilters {
  search: string;
  pillar: string;
  platform: "" | "threads" | "instagram";
}

export function pillarColorVar(pillars: Pillar[], key: string | undefined): string {
  const hit = pillars.find((p) => p.key === key);
  return `var(--color-${hit?.color ?? "pillar-build"})`;
}
