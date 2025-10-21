export const runtime = 'nodejs';
import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = req.cookies.get('spotify_oauth_state')?.value;
  const codeVerifier = req.cookies.get('spotify_code_verifier')?.value;

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return new NextResponse('Invalid state or missing code', { status: 400 });
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer
        .from(`${process.env.SPOTIFY_CLIENT_ID!}:${process.env.SPOTIFY_CLIENT_SECRET!}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      code_verifier: codeVerifier,
    }),
    cache: 'no-store',
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return new NextResponse(`Token exchange failed: ${text}`, { status: 401 });
  }

  const token = await tokenRes.json();
  const res = NextResponse.redirect(process.env.APP_BASE_URL || 'http://localhost:3000');

  res.cookies.set('spotify_access_token', token.access_token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: token.expires_in
  });
  if (token.refresh_token) {
    res.cookies.set('spotify_refresh_token', token.refresh_token, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30
    });
  }
  // 掃除
  res.cookies.set('spotify_code_verifier', '', { path: '/', maxAge: 0 });
  res.cookies.set('spotify_oauth_state', '', { path: '/', maxAge: 0 });

  return res;
}
