export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('spotify_access_token')?.value;
  if (!accessToken) {
    return new NextResponse(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const r = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (r.status === 401) {
    return new NextResponse(JSON.stringify({ error: 'Token expired' }), { status: 401 });
  }
  if (!r.ok) {
    const text = await r.text();
    return new NextResponse(JSON.stringify({ error: text }), { status: 500 });
  }

  const json = await r.json();
  const items = (json.items ?? []).map((it: any) => ({
    spotify_track_id: it.track.id,
    title: it.track.name,
    artist: it.track.artists.map((a: any) => a.name).join(', '),
    album_image_url: it.track.album.images?.[0]?.url ?? null,
    played_at: it.played_at,
    duration_ms: it.track.duration_ms,
  }));
  return NextResponse.json({ items });
}
