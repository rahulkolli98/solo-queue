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
