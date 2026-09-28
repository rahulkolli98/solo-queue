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

export default crons;
