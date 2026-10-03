import { NextResponse } from "next/server";
import { OperatorKeyMissingError, mintOperatorToken } from "@/lib/operatorToken";

export const dynamic = "force-dynamic";

/**
 * Mints the operator's Convex token. The proxy puts this route behind HTTP
 * Basic Auth like the rest of the app (only /api/oauth/ is exempt), so only
 * someone who has logged in can get a token. Tokens last an hour and the
 * browser refreshes them in the background.
 */
export async function GET(request: Request) {
  // A page on another site must not be able to trigger this with the operator's cached login.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const { token, expiresAt } = await mintOperatorToken();
    return NextResponse.json({ token, expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message =
      err instanceof OperatorKeyMissingError ? err.message : "Could not create a session token.";
    console.error(`convex-token: ${message}`);
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
