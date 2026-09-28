import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Single-operator gate. Vercel Hobby cannot protect production domains
 * (Deployment Protection covers previews only), so this proxy enforces
 * HTTP Basic Auth when BASIC_AUTH_USER/PASS are set.
 *
 * - Creds set → Authorization header required on every app route.
 * - Creds unset + production → refuse to serve (fail closed; avoids an
 *   accidentally public dashboard). Set the vars in Vercel instead.
 * - Creds unset + dev → open (local development convenience).
 */
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Auth not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASS.",
        { status: 503 }
      );
    }
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`${user}:${pass}`)}`;
  if (header === expected) return NextResponse.next();

  return new NextResponse("Solo Queue is private.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Solo Queue"' },
  });
}

export const config = {
  // OAuth callbacks MUST stay public: Meta's servers redirect here without
  // credentials, so gating them would break every Connect flow (401).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/oauth/).*)"],
};
