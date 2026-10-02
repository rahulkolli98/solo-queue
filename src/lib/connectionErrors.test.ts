import { describe, expect, it } from "vitest";
import {
  ERROR_COPY,
  THREADS_PRIVATE_PROFILE_NOTE,
  connectionHint,
} from "./connectionErrors";

describe("connectionHint", () => {
  it("gives Threads connections the private-profile guidance in every status", () => {
    for (const status of ["healthy", "expiring", "failed"] as const) {
      expect(connectionHint("threads", status)).toBe(THREADS_PRIVATE_PROFILE_NOTE);
    }
  });

  it("has nothing to add for Instagram or for no connection", () => {
    expect(connectionHint("instagram", "failed")).toBeNull();
    expect(connectionHint("threads", null)).toBeNull();
  });

  it("tells the user how to fix it, not just that it failed", () => {
    expect(THREADS_PRIVATE_PROFILE_NOTE).toMatch(/public/i);
    expect(THREADS_PRIVATE_PROFILE_NOTE).toMatch(/reconnect/i);
  });
});

describe("ERROR_COPY", () => {
  it("covers every OAuth error code the callbacks can emit", () => {
    for (const code of ["denied", "not-professional", "bad-state", "exchange", "misconfigured"]) {
      expect(ERROR_COPY[code]?.title).toBeTruthy();
      expect(ERROR_COPY[code]?.body).toBeTruthy();
    }
  });
});
