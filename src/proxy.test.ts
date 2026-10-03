import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

function req(authorization?: string, path = "/queue"): NextRequest {
  return new NextRequest(`https://app.example.test${path}`, {
    headers: authorization ? { authorization } : {},
  });
}

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("Basic Auth gate (proxy)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets a correct login through", () => {
    vi.stubEnv("BASIC_AUTH_USER", "rahul");
    vi.stubEnv("BASIC_AUTH_PASS", "s3cret");
    expect(proxy(req(basic("rahul", "s3cret"))).status).toBe(200);
  });

  it("answers 401 with a challenge when no credentials are sent", () => {
    vi.stubEnv("BASIC_AUTH_USER", "rahul");
    vi.stubEnv("BASIC_AUTH_PASS", "s3cret");
    const res = proxy(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("answers 401 for a wrong password or user", () => {
    vi.stubEnv("BASIC_AUTH_USER", "rahul");
    vi.stubEnv("BASIC_AUTH_PASS", "s3cret");
    expect(proxy(req(basic("rahul", "nope"))).status).toBe(401);
    expect(proxy(req(basic("someone", "s3cret"))).status).toBe(401);
  });

  it("fails closed (503) in production when the credentials are not configured", () => {
    vi.stubEnv("BASIC_AUTH_USER", "");
    vi.stubEnv("BASIC_AUTH_PASS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(req()).status).toBe(503);
  });

  it("is open in development when the credentials are not configured", () => {
    vi.stubEnv("BASIC_AUTH_USER", "");
    vi.stubEnv("BASIC_AUTH_PASS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(req()).status).toBe(200);
  });

  it("returns a real 404 for the dev gallery in production, even when logged in", () => {
    vi.stubEnv("BASIC_AUTH_USER", "rahul");
    vi.stubEnv("BASIC_AUTH_PASS", "s3cret");
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(req(basic("rahul", "s3cret"), "/dev")).status).toBe(404);
    expect(proxy(req(basic("rahul", "s3cret"), "/dev/loading/today")).status).toBe(404);
    expect(proxy(req(basic("rahul", "s3cret"), "/devices")).status).toBe(200);
  });

  it("serves the dev gallery in development", () => {
    vi.stubEnv("BASIC_AUTH_USER", "");
    vi.stubEnv("BASIC_AUTH_PASS", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(req(undefined, "/dev")).status).toBe(200);
  });

  it("keeps the operator token route behind the login", () => {
    vi.stubEnv("BASIC_AUTH_USER", "rahul");
    vi.stubEnv("BASIC_AUTH_PASS", "s3cret");
    const [pattern] = config.matcher;
    expect(new RegExp(`^${pattern}$`).test("/api/convex-token")).toBe(true);
    expect(proxy(req(undefined, "/api/convex-token")).status).toBe(401);
    expect(proxy(req(basic("rahul", "s3cret"), "/api/convex-token")).status).toBe(200);
  });

  it("keeps the OAuth callbacks outside the matcher so Meta can reach them", () => {
    const [pattern] = config.matcher;
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("/api/oauth/threads/callback")).toBe(false);
    expect(re.test("/api/oauth/instagram/callback")).toBe(false);
    expect(re.test("/queue")).toBe(true);
    expect(re.test("/")).toBe(true);
  });
});
