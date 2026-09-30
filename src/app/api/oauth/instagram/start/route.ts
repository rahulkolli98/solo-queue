import { NextResponse } from "next/server";
import {
  INSTAGRAM_STATE_COOKIE,
  instagramAuthorizeUrl,
  newState,
  stateCookieHeader,
} from "@/lib/oauth";

function fail(code: string) {
  return NextResponse.redirect(
    new URL(`/settings/connections?error=${code}&platform=instagram`, process.env.APP_BASE_URL ?? "http://localhost:3000")
  );
}

export async function GET() {
  const appId = process.env.IG_APP_ID;
  const redirectUri = process.env.IG_REDIRECT_URI;
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
    instagramAuthorizeUrl({ appId, redirectUri, state })
  );
  res.headers.append(
    "Set-Cookie",
    stateCookieHeader(INSTAGRAM_STATE_COOKIE, state, secure)
  );
  return res;
}
