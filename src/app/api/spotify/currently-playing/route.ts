export const runtime = "nodejs";

import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";

type CurrentlyPlayingItem = {
  trackId: string;
  title: string;
  artist: string;
  albumImageUrl: string | null;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
};

type RefreshResult = {
  accessToken: string;
  expiresIn: number;
};

type RefreshError = {
  message: string;
  needsReauth: boolean;
};

function parseRefreshError(text: string): RefreshError {
  try {
    const parsed = JSON.parse(text);
    const err = parsed?.error;
    const desc = parsed?.error_description;
    if (err === "invalid_grant") {
      return {
        message: desc || "Refresh token revoked",
        needsReauth: true,
      };
    }
  } catch {
    // fallthrough
  }
  return { message: text || "refresh failed", needsReauth: false };
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID!}:${process.env.SPOTIFY_CLIENT_SECRET!}`,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    const parsed = parseRefreshError(text);
    const err = new Error(parsed.message) as Error & { needsReauth?: boolean };
    err.needsReauth = parsed.needsReauth;
    throw err;
  }

  const token = await tokenRes.json();
  return {
    accessToken: token.access_token,
    expiresIn: token.expires_in,
  };
}

async function fetchCurrentlyPlaying(accessToken: string) {
  return fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
}

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("spotify_access_token")?.value;
  if (!accessToken) {
    return new NextResponse(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
    });
  }

  let r = await fetchCurrentlyPlaying(accessToken);
  let refreshedToken: RefreshResult | null = null;

  if (r.status === 401) {
    const refreshToken = req.cookies.get("spotify_refresh_token")?.value;
    if (!refreshToken) {
      return new NextResponse(JSON.stringify({ error: "no refresh token" }), {
        status: 401,
      });
    }
    try {
      refreshedToken = await refreshAccessToken(refreshToken);
    } catch (e: any) {
      const needsReauth = Boolean(e?.needsReauth);
      return new NextResponse(
        JSON.stringify({
          error: needsReauth ? "relogin required" : e?.message ?? "refresh failed",
        }),
        { status: 401 },
      );
    }
    r = await fetchCurrentlyPlaying(refreshedToken.accessToken);
  }

  if (r.status === 204) {
    const res = NextResponse.json(null);
    if (refreshedToken) {
      res.cookies.set("spotify_access_token", refreshedToken.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: refreshedToken.expiresIn,
      });
    }
    return res;
  }
  if (r.status === 401) {
    return new NextResponse(JSON.stringify({ error: "relogin required" }), {
      status: 401,
    });
  }
  if (!r.ok) {
    const text = await r.text();
    return new NextResponse(JSON.stringify({ error: text }), { status: 500 });
  }

  const json = await r.json();
  if (!json?.is_playing || !json?.item) {
    const res = NextResponse.json(null);
    if (refreshedToken) {
      res.cookies.set("spotify_access_token", refreshedToken.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: refreshedToken.expiresIn,
      });
    }
    return res;
  }

  const item: CurrentlyPlayingItem = {
    trackId: json.item.id,
    title: json.item.name,
    artist: (json.item.artists ?? []).map((a: any) => a.name).join(", "),
    albumImageUrl: json.item.album?.images?.[0]?.url ?? null,
    isPlaying: Boolean(json.is_playing),
    progressMs: Number(json.progress_ms ?? 0),
    durationMs: Number(json.item.duration_ms ?? 0),
  };

  const res = NextResponse.json(item);
  if (refreshedToken) {
    res.cookies.set("spotify_access_token", refreshedToken.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: refreshedToken.expiresIn,
    });
  }
  return res;
}
