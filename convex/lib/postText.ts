import type { Doc } from "../_generated/dataModel";

/**
 * The text a slot posts. A carousel is one draft that can go to Instagram (its caption, `body`) and to Threads
 * (its own text, `threadsText`); every other draft posts its `body` wherever it is queued.
 */
export function postText(
  draft: Pick<Doc<"drafts">, "platform" | "body" | "threadsText">,
  slotPlatform: "threads" | "instagram"
): string {
  return slotPlatform === "threads" && draft.platform !== "threads" ? (draft.threadsText ?? "") : draft.body;
}
