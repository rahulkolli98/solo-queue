import { describe, expect, it } from "vitest";
import {
  isLivePublishing,
  isTestPublishAllowed,
} from "../../convex/lib/safety";

describe("isLivePublishing", () => {
  it("is live only for the exact value 0", () => {
    expect(isLivePublishing("0")).toBe(true);
  });

  it.each([undefined, "", "1", "true", "false", "no", " 0", "0 ", "00"])(
    "stays dry-run for %j",
    (value) => {
      expect(isLivePublishing(value)).toBe(false);
    }
  );
});

describe("isTestPublishAllowed", () => {
  it("is allowed only for the exact value 1", () => {
    expect(isTestPublishAllowed("1")).toBe(true);
  });

  it.each([undefined, "", "0", "true", "yes", " 1", "1 ", "11"])(
    "stays off for %j",
    (value) => {
      expect(isTestPublishAllowed(value)).toBe(false);
    }
  );
});
