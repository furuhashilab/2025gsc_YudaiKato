import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("spotify_access_token", "", { path: "/", maxAge: 0 });
  res.cookies.set("spotify_refresh_token", "", { path: "/", maxAge: 0 });
  return res;
}
