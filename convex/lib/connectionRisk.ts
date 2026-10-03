/**
 * Why a scheduled post may not go out, judged from its platform's connection.
 * Returns the sentence the Queue shows on the post, or null when it looks fine.
 * Only scheduled posts are at risk: a published, claimed or failed post has
 * already been decided.
 */
export function slotRisk(
  platform: "threads" | "instagram",
  slotStatus: "scheduled" | "claimed" | "published" | "failed",
  scheduledAt: number,
  connection: { status: "healthy" | "expiring" | "failed"; tokenExpiresAt: number } | undefined
): string | null {
  if (slotStatus !== "scheduled") return null;
  const name = platform === "threads" ? "Threads" : "Instagram";
  if (!connection) return `${name} is not connected. Connect it before this posts.`;
  if (connection.status === "failed") {
    return `The ${name} connection needs attention. Reconnect before this posts.`;
  }
  if (connection.status === "expiring" && connection.tokenExpiresAt <= scheduledAt) {
    return `The ${name} token expires before this posts. Reconnect to refresh it.`;
  }
  return null;
}
