import { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { THREADS_STATE_COOKIE, verifyState } from "@/lib/oauth";

function fail(code: string): never {
  redirect(`/connections?error=${code}&platform=threads`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // User denied permissions (or Meta returned an OAuth error).
  if (url.searchParams.get("error")) {
    fail("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const cookieState = jar.get(THREADS_STATE_COOKIE)?.value ?? null;
  if (!code || !verifyState(state, cookieState)) {
    fail("bad-state");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) fail("misconfigured");

  try {
    const client = new ConvexHttpClient(convexUrl as string);
    await client.action(api.connections.exchangeCode, {
      platform: "threads",
      code,
    });
  } catch {
    fail("exchange");
  }
  redirect("/connections?connected=threads");
}
