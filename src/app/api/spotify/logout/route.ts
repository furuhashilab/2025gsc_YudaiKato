export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("spotify_access_token", "", { path: "/", maxAge: 0 });
  res.cookies.set("spotify_refresh_token", "", { path: "/", maxAge: 0 });
  res.cookies.set("spotify_code_verifier", "", { path: "/", maxAge: 0 });
  res.cookies.set("spotify_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}
