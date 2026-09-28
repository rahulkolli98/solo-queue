import { NextResponse } from "next/server";
import {
  THREADS_STATE_COOKIE,
  newState,
  stateCookieHeader,
  threadsAuthorizeUrl,
} from "@/lib/oauth";

function fail(code: string) {
  return NextResponse.redirect(
    new URL(`/connections?error=${code}&platform=threads`, process.env.APP_BASE_URL ?? "http://localhost:3000")
  );
}

export async function GET() {
  const appId = process.env.THREADS_APP_ID;
  const redirectUri = process.env.THREADS_REDIRECT_URI;
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  if (!appId || !redirectUri) return fail("misconfigured");

  let state: string;
  try {
    state = newState().state;
  } catch {
    return fail("misconfigured");
  }
  const secure = base.startsWith("https://");
  const res = NextResponse.redirect(
    threadsAuthorizeUrl({ appId, redirectUri, state })
  );
  res.headers.append(
    "Set-Cookie",
    stateCookieHeader(THREADS_STATE_COOKIE, state, secure)
  );
  return res;
}
