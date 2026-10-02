import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTAGRAM_SCOPES,
  THREADS_SCOPES,
  instagramAuthorizeUrl,
  newState,
  stateCookieHeader,
  threadsAuthorizeUrl,
  verifyState,
} from "./oauth";

describe("OAuth state", () => {
  beforeEach(() => {
    vi.stubEnv("OAUTH_STATE_SECRET", "test-secret-test-secret-test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips: a fresh state verifies against its own cookie", () => {
    const { state } = newState();
    expect(verifyState(state, state)).toBe(true);
  });

  it("issues a different state each time", () => {
    expect(newState().state).not.toBe(newState().state);
  });

  it("rejects a missing state or cookie", () => {
    const { state } = newState();
    expect(verifyState(null, state)).toBe(false);
    expect(verifyState(state, null)).toBe(false);
    expect(verifyState("", "")).toBe(false);
  });

  it("rejects a state that does not match the cookie", () => {
    expect(verifyState(newState().state, newState().state)).toBe(false);
  });

  it("rejects a forged signature even when state and cookie agree", () => {
    const { state } = newState();
    const [nonce] = state.split(".");
    const forged = `${nonce}.${"0".repeat(64)}`;
    expect(verifyState(forged, forged)).toBe(false);
  });

  it("rejects a state signed with another secret", () => {
    const { state } = newState();
    vi.stubEnv("OAUTH_STATE_SECRET", "a-different-secret-a-different-secret");
    expect(verifyState(state, state)).toBe(false);
  });

  it("rejects malformed states without throwing", () => {
    expect(verifyState("nodot", "nodot")).toBe(false);
    expect(verifyState(".onlysig", ".onlysig")).toBe(false);
    expect(verifyState("a.b", "a.b")).toBe(false);
  });

  it("throws when OAUTH_STATE_SECRET is not configured", () => {
    vi.stubEnv("OAUTH_STATE_SECRET", "");
    expect(() => newState()).toThrow(/OAUTH_STATE_SECRET/);
  });
});

describe("state cookie header", () => {
  it("is HttpOnly, scoped to /api/oauth, short-lived and SameSite=Lax", () => {
    const header = stateCookieHeader("sq_oauth_state_threads", "abc.def", false);
    expect(header).toContain("sq_oauth_state_threads=abc.def");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/api/oauth");
    expect(header).toContain("Max-Age=600");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Secure");
  });

  it("adds Secure when asked", () => {
    expect(stateCookieHeader("n", "v", true)).toContain("Secure");
  });
});

describe("authorize URLs", () => {
  const args = {
    appId: "123",
    redirectUri: "https://example.test/api/oauth/threads/callback",
    state: "nonce.sig",
  };

  it("builds the Threads URL with every required scope and the state", () => {
    const url = new URL(threadsAuthorizeUrl(args));
    expect(url.origin + url.pathname).toBe("https://www.threads.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe(args.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("nonce.sig");
    expect(url.searchParams.get("scope")).toBe(THREADS_SCOPES.join(","));
    expect(THREADS_SCOPES).toContain("threads_content_publish");
  });

  it("builds the Instagram URL with the Instagram Login scopes", () => {
    const url = new URL(instagramAuthorizeUrl(args));
    expect(url.origin + url.pathname).toBe("https://api.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe(INSTAGRAM_SCOPES.join(","));
    expect(INSTAGRAM_SCOPES).toContain("instagram_business_content_publish");
  });
});
