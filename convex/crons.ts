import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily token-expiry sweep: refresh anything expiring within 7 days.
// Failures degrade healthy → expiring → failed (see applyRefreshResult).
crons.daily(
  "token-expiry-check",
  { hourUTC: 6, minuteUTC: 0 },
  internal.connections.checkExpiring
);

// Publisher tick: claim due slots and publish them. DRY-RUN unless the Convex
// env var PUBLISH_DRY_RUN is exactly "0" (see convex/lib/safety.ts).
crons.interval("publisher-tick", { minutes: 1 }, internal.publish.tick, {});

// Opt-in: removes hosted files of long-published posts, only when
// Settings > Media > cleanupAfterDays is set (otherwise a no-op).
crons.interval("media-cleanup", { hours: 24 }, internal.media.cleanupPublished, {});

export default crons;
