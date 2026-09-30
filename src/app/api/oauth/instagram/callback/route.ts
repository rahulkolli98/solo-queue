import { ConvexHttpClient } from "convex/browser";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { INSTAGRAM_STATE_COOKIE, verifyState } from "@/lib/oauth";

function fail(code: string, detail?: string): never {
  const params = new URLSearchParams({ error: code, platform: "instagram" });
  if (detail) params.set("detail", detail.slice(0, 200));
  redirect(`/settings/connections?${params.toString()}`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  if (url.searchParams.get("error")) {
    fail("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const cookieState = jar.get(INSTAGRAM_STATE_COOKIE)?.value ?? null;
  if (!code || !verifyState(state, cookieState)) {
    fail("bad-state");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) fail("misconfigured");

  try {
    const client = new ConvexHttpClient(convexUrl as string);
    await client.action(api.connections.exchangeCode, {
      platform: "instagram",
      code,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("NOT_PROFESSIONAL")) {
      fail("not-professional");
    }
    fail("exchange", e instanceof Error ? e.message : undefined);
  }
  redirect("/settings/connections?connected=instagram");
}
