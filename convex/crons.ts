import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Daily token-expiry sweep: refresh anything expiring within 7 days.
// Failures degrade healthy → expiring → failed (see applyRefreshResult).
crons.daily(
  "token-expiry-check",
  { hourUTC: 6, minuteUTC: 0 },
  internal.connections.checkExpiring
);

// Publisher tick: claim due slots and publish them (dry-run via PUBLISH_DRY_RUN=1).
crons.interval("publisher-tick", { minutes: 1 }, api.publish.tick, {});

export default crons;
