import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { Pillar } from "../../../../convex/lib/settingsModel";

/** One row of the Research board: a topic with its source count and readiness. */
export type BoardTopic = FunctionReturnType<typeof api.topics.board>[number];
export type Source = FunctionReturnType<typeof api.sources.listByTopic>[number];
export type Frame = FunctionReturnType<typeof api.frames.list>[number];
export type { Pillar };

export function pillarOf(pillars: Pillar[], key: string | undefined): Pillar | undefined {
  return key ? pillars.find((p) => p.key === key) : undefined;
}
