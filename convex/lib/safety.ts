/**
 * Prod-safety switches, read from the Convex deployment environment.
 *
 * Both default to the SAFE state: anything other than the exact enabling
 * value (unset, empty, "true", "yes", a typo) keeps the dangerous behavior
 * off. Pure functions so they can be unit-tested without a Convex runtime.
 */

/** The publisher posts for real only when PUBLISH_DRY_RUN is exactly "0". */
export function isLivePublishing(value: string | undefined): boolean {
  return value === "0";
}

/**
 * The Connections test publish/delete (they post to the real Threads
 * account) work only when ALLOW_TEST_PUBLISH is exactly "1".
 */
export function isTestPublishAllowed(value: string | undefined): boolean {
  return value === "1";
}

export const TEST_PUBLISH_DISABLED_MESSAGE =
  "TEST_PUBLISH_DISABLED: Test posts are switched off on this deployment. Set ALLOW_TEST_PUBLISH=1 in the Convex environment to enable them.";
