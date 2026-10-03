"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface NavCounts {
  queue: number;
  research: number;
}

/**
 * Live badge counts for the sidebar and the phone tab bar: scheduled posts
 * across both platforms, and topics in the research inbox. Zero while loading.
 */
export function useNavCounts(): NavCounts {
  const threads =
    useQuery(api.slots.countScheduledByPlatform, { platform: "threads" }) ?? 0;
  const instagram =
    useQuery(api.slots.countScheduledByPlatform, { platform: "instagram" }) ??
    0;
  const topics = useQuery(api.topics.count) ?? 0;
  return { queue: threads + instagram, research: topics };
}
