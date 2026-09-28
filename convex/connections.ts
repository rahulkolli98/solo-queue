import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const platformArg = v.union(v.literal("threads"), v.literal("instagram"));

async function postForm(
  url: string,
  fields: Record<string, string>
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
  const data = (await res.json().catch(() => null)) as {
    error_message?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    const msg =
      data?.error_message ?? data?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Provider error: ${msg}`);
  }
  return data;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => null)) as {
    error_message?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    const msg =
      data?.error_message ?? data?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Provider error: ${msg}`);
  }
  return data;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const upsertConnection = internalMutation({
  args: {
    platform: platformArg,
    platformUserId: v.string(),
    handle: v.string(),
    accessToken: v.string(),
    tokenExpiresAt: v.number(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique();
    const row = {
      platform: args.platform,
      platformUserId: args.platformUserId,
      handle: args.handle,
      accessToken: args.accessToken,
      tokenExpiresAt: args.tokenExpiresAt,
      scopes: args.scopes,
      status: "healthy" as const,
      lastCheckedAt: Date.now(),
      lastError: undefined as string | undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("connections", row);
  },
});

async function exchangeThreads(code: string): Promise<{
  platformUserId: string;
  handle: string;
  accessToken: string;
  tokenExpiresAt: number;
}> {
  const appId = requireEnv("THREADS_APP_ID");
  const appSecret = requireEnv("THREADS_APP_SECRET");
  const redirectUri = requireEnv("THREADS_REDIRECT_URI");

  const short = (await postForm("https://graph.threads.com/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  })) as { access_token?: string };
  if (!short?.access_token) throw new Error("Threads exchange returned no token.");

  const long = (await getJson(
    `https://graph.threads.com/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(
      appSecret
    )}&access_token=${encodeURIComponent(short.access_token)}`
  )) as { access_token?: string; expires_in?: number };
  if (!long?.access_token) throw new Error("Threads long-lived exchange failed.");

  const me = (await getJson(
    `https://graph.threads.com/v1.0/me?fields=id,username&access_token=${encodeURIComponent(
      long.access_token
    )}`
  )) as { id?: string; username?: string };
  if (!me?.id) throw new Error("Threads profile fetch failed.");

  return {
    platformUserId: me.id,
    handle: me.username ? `@${me.username}` : me.id,
    accessToken: long.access_token,
    tokenExpiresAt: Date.now() + (long.expires_in ?? 60 * 24 * 3600) * 1000,
  };
}

async function exchangeInstagram(code: string): Promise<{
  platformUserId: string;
  handle: string;
  accessToken: string;
  tokenExpiresAt: number;
  scopes: string[];
}> {
  const appId = requireEnv("IG_APP_ID");
  const appSecret = requireEnv("IG_APP_SECRET");
  const redirectUri = requireEnv("IG_REDIRECT_URI");

  const shortRaw = (await postForm(
    "https://api.instagram.com/oauth/access_token",
    {
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }
  )) as
    | { access_token?: string; permissions?: string }
    | { data?: { access_token?: string; permissions?: string }[] };
  const short = Array.isArray((shortRaw as { data?: unknown }).data)
    ? (shortRaw as { data: { access_token?: string; permissions?: string }[] })
        .data[0]
    : (shortRaw as { access_token?: string; permissions?: string });
  if (!short?.access_token)
    throw new Error("Instagram exchange returned no token.");

  const long = (await getJson(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      appSecret
    )}&access_token=${encodeURIComponent(short.access_token)}`
  )) as { access_token?: string; expires_in?: number };
  if (!long?.access_token)
    throw new Error("Instagram long-lived exchange failed.");

  const me = (await getJson(
    `https://graph.instagram.com/v26.0/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(
      long.access_token
    )}`
  )) as { user_id?: string; username?: string; account_type?: string };
  if (!me?.user_id) throw new Error("Instagram profile fetch failed.");
  if (me.account_type !== "Business" && me.account_type !== "Media_Creator") {
    throw new Error(
      `NOT_PROFESSIONAL: account type is ${me.account_type ?? "unknown"}.`
    );
  }

  const scopes =
    short.permissions
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return {
    platformUserId: me.user_id,
    handle: me.username ? `@${me.username}` : me.user_id,
    accessToken: long.access_token,
    tokenExpiresAt: Date.now() + (long.expires_in ?? 60 * 24 * 3600) * 1000,
    scopes: scopes.length > 0 ? scopes : ["instagram_business_basic"],
  };
}
/**
 * Exchange an OAuth code for a stored long-lived connection.
 * Throws on provider errors; the callback route maps these to UI states.
 */
export const exchangeCode = action({
  args: { platform: platformArg, code: v.string() },
  handler: async (ctx, args): Promise<{ handle: string }> => {
    if (args.platform === "threads") {
      const t = await exchangeThreads(args.code);
      await ctx.runMutation(internal.connections.upsertConnection, {
        platform: "threads",
        ...t,
        scopes: ["threads_basic", "threads_content_publish"],
      });
      return { handle: t.handle };
    }
    const g = await exchangeInstagram(args.code);
    await ctx.runMutation(internal.connections.upsertConnection, {
      platform: "instagram",
      platformUserId: g.platformUserId,
      handle: g.handle,
      accessToken: g.accessToken,
      tokenExpiresAt: g.tokenExpiresAt,
      scopes: g.scopes,
    });
    return { handle: g.handle };
  },
});

/** Connections for the dashboard (tokens never leave the backend). */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("connections").collect();
    return rows.map((r) => ({
      platform: r.platform,
      handle: r.handle,
      scopes: r.scopes,
      status: r.status,
      tokenExpiresAt: r.tokenExpiresAt,
      lastCheckedAt: r.lastCheckedAt,
      lastError: r.lastError ?? null,
    }));
  },
});

// ----- Token refresh -----

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export const getOne = internalQuery({
  args: { platform: platformArg },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("connections")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique();
  },
});

export const listExpiring = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("connections").collect();
    return rows.filter((r) => r.tokenExpiresAt < args.before);
  },
});

/**
 * Single state-transition point for refresh outcomes. First failure
 * degrades healthy → expiring; a second consecutive failure flips to
 * failed. Success always restores healthy. No counter column needed.
 */
export const applyRefreshResult = internalMutation({
  args: {
    platform: platformArg,
    ok: v.boolean(),
    accessToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique();
    if (!row) throw new Error(`No ${args.platform} connection to refresh.`);
    if (args.ok) {
      await ctx.db.patch(row._id, {
        accessToken: args.accessToken ?? row.accessToken,
        tokenExpiresAt: args.tokenExpiresAt ?? row.tokenExpiresAt,
        status: "healthy",
        lastCheckedAt: Date.now(),
        lastError: undefined,
      });
      return "healthy" as const;
    }
    const next = row.status === "healthy" ? "expiring" : "failed";
    await ctx.db.patch(row._id, {
      status: next,
      lastCheckedAt: Date.now(),
      lastError: args.error ?? "Refresh failed.",
    });
    return next;
  },
});

async function refreshWithProvider(
  platform: "threads" | "instagram",
  current: string
): Promise<{ accessToken: string; tokenExpiresAt: number }> {
  if (platform === "threads") {
    const data = (await getJson(
      `https://graph.threads.com/access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(
        current
      )}`
    )) as { access_token?: string; expires_in?: number };
    if (!data?.expires_in)
      throw new Error("Threads refresh returned no expiry.");
    return {
      accessToken: data.access_token ?? current,
      tokenExpiresAt: Date.now() + data.expires_in * 1000,
    };
  }
  const data = (await getJson(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
      current
    )}`
  )) as { access_token?: string; expires_in?: number };
  if (!data?.access_token || !data?.expires_in)
    throw new Error("Instagram refresh returned no token.");
  return {
    accessToken: data.access_token,
    tokenExpiresAt: Date.now() + data.expires_in * 1000,
  };
}

/** Manual refresh (dashboard "Refresh tokens" button). Never throws. */
export const refresh = action({
  args: { platform: platformArg },
  handler: async (ctx, args): Promise<{ status: string; error?: string }> => {
    const row = await ctx.runQuery(internal.connections.getOne, {
      platform: args.platform,
    });
    if (!row) return { status: "missing", error: "No connection stored." };
    try {
      const t = await refreshWithProvider(args.platform, row.accessToken);
      const status = await ctx.runMutation(
        internal.connections.applyRefreshResult,
        {
          platform: args.platform,
          ok: true,
          accessToken: t.accessToken,
          tokenExpiresAt: t.tokenExpiresAt,
        }
      );
      return { status };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Refresh failed.";
      const status = await ctx.runMutation(
        internal.connections.applyRefreshResult,
        { platform: args.platform, ok: false, error: message }
      );
      return { status, error: message };
    }
  },
});

/** Daily cron: refresh every connection expiring within 7 days. */
export const checkExpiring = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ checked: number; healthy: number; degraded: number }> => {
    const rows = await ctx.runQuery(internal.connections.listExpiring, {
      before: Date.now() + SEVEN_DAYS_MS,
    });
    let healthy = 0;
    let degraded = 0;
    for (const row of rows) {
      try {
        const t = await refreshWithProvider(row.platform, row.accessToken);
        await ctx.runMutation(internal.connections.applyRefreshResult, {
          platform: row.platform,
          ok: true,
          accessToken: t.accessToken,
          tokenExpiresAt: t.tokenExpiresAt,
        });
        healthy++;
      } catch (e) {
        await ctx.runMutation(internal.connections.applyRefreshResult, {
          platform: row.platform,
          ok: false,
          error: e instanceof Error ? e.message : "Refresh failed.",
        });
        degraded++;
      }
    }
    return { checked: rows.length, healthy, degraded };
  },
});

/**
 * DEV-ONLY drill helper: patch a connection row to simulate failure states
 * (expired tokens, failed refreshes) for TASK-014/015 verification.
 * Never call from UI code.
 */
export const drillSetConnection = internalMutation({
  args: {
    platform: platformArg,
    tokenExpiresAt: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("healthy"), v.literal("expiring"), v.literal("failed"))
    ),
    accessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique();
    if (!row) throw new Error(`No ${args.platform} connection to drill.`);
    const patch: {
      tokenExpiresAt?: number;
      status?: "healthy" | "expiring" | "failed";
      accessToken?: string;
    } = {};
    if (args.tokenExpiresAt !== undefined)
      patch.tokenExpiresAt = args.tokenExpiresAt;
    if (args.status !== undefined) patch.status = args.status;
    if (args.accessToken !== undefined) patch.accessToken = args.accessToken;
    await ctx.db.patch(row._id, patch);
    return row._id;
  },
});

// ----- Connection proof tests (TASK-013) -----

const TEST_POST_TEXT = "Solo Queue connection test — delete me.";

/**
 * Threads proof: publish a labeled throwaway via the text fast-path,
 * then delete it with deleteThreadsTest. Returns the platform media id.
 */
export const publishThreadsTest = action({
  args: {},
  handler: async (ctx): Promise<{ id: string }> => {
    const row = await ctx.runQuery(internal.connections.getOne, {
      platform: "threads",
    });
    if (!row) throw new Error("No threads connection stored.");
    const res = await fetch(
      `https://graph.threads.com/v1.0/${row.platformUserId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "TEXT",
          text: TEST_POST_TEXT,
          auto_publish_text: true,
          access_token: row.accessToken,
        }),
      }
    );
    const data = (await res.json().catch(() => null)) as {
      id?: string;
      error_message?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok || !data?.id) {
      throw new Error(
        `Threads test publish failed: ${data?.error_message ?? data?.error?.message ?? `HTTP ${res.status}`}`
      );
    }
    return { id: data.id };
  },
});

export const deleteThreadsTest = action({
  args: { mediaId: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    const row = await ctx.runQuery(internal.connections.getOne, {
      platform: "threads",
    });
    if (!row) throw new Error("No threads connection stored.");
    const res = await fetch(
      `https://graph.threads.com/v1.0/${args.mediaId}?access_token=${encodeURIComponent(
        row.accessToken
      )}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error_message?: string;
      } | null;
      throw new Error(
        `Threads test delete failed: ${data?.error_message ?? `HTTP ${res.status}`}`
      );
    }
    return { deleted: true };
  },
});

/**
 * Instagram proof: media deletion is unavailable on the Instagram Login
 * path, so publishing a throwaway is unsafe. Instead, verify the token
 * with a side-effect-free profile fetch.
 */
export const verifyInstagram = action({
  args: {},
  handler: async (ctx): Promise<{ username: string; userId: string }> => {
    const row = await ctx.runQuery(internal.connections.getOne, {
      platform: "instagram",
    });
    if (!row) throw new Error("No instagram connection stored.");
    const me = (await getJson(
      `https://graph.instagram.com/v26.0/me?fields=user_id,username&access_token=${encodeURIComponent(
        row.accessToken
      )}`
    )) as { user_id?: string; username?: string };
    if (!me?.user_id) throw new Error("Instagram token verification failed.");
    return { username: me.username ?? me.user_id, userId: me.user_id };
  },
});
