export const ERROR_COPY: Record<string, { title: string; body: string }> = {
  denied: {
    title: "Permission was denied at Meta.",
    body: "Reconnect and approve the requested permissions — without them Solo Queue cannot publish for you.",
  },
  "not-professional": {
    title: "That Instagram account is personal.",
    body: "Convert it to Professional first (Instagram → Settings → Account type → Switch to professional account) and reconnect — the API cannot see personal accounts.",
  },
  "bad-state": {
    title: "The login round-trip was interrupted.",
    body: "The security check failed (stale or forged state). Try connecting again.",
  },
  exchange: {
    title: "Meta refused the token exchange.",
    body: "Auth codes expire in an hour and work once — reconnect and complete the flow promptly. If it persists, check the redirect URIs in the Meta app dashboard.",
  },
  misconfigured: {
    title: "Server OAuth configuration is missing.",
    body: "The app IDs, secrets, or redirect URIs are not set. Check .env.local against .env.example.",
  },
};

/**
 * Private Threads profiles can stop their long-lived token from refreshing,
 * and Meta's refresh error is generic. Surfaced on the Threads card so a
 * failed refresh comes with a concrete next step (FR-001, US-001 edge case).
 */
export const THREADS_PRIVATE_PROFILE_NOTE =
  "Keep your Threads profile public while connected. Tokens for private profiles can stop refreshing silently; if refresh fails, make the profile public and reconnect.";

/** Extra guidance for a connection, or null when there is nothing to add. */
export function connectionHint(
  platform: "threads" | "instagram",
  status: "healthy" | "expiring" | "failed" | null
): string | null {
  if (platform !== "threads" || status === null) return null;
  return THREADS_PRIVATE_PROFILE_NOTE;
}
