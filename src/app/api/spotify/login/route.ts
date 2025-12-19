export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createPkcePair } from '@/lib/spotify/pkce';

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  const baseScope = process.env.SPOTIFY_SCOPE || 'user-read-recently-played';
  const requiredScopes = [
    'user-read-currently-playing',
    'user-read-playback-state',
  ];
  const scopeSet = new Set(baseScope.split(/\s+/).filter(Boolean));
  requiredScopes.forEach((s) => scopeSet.add(s));
  const scope = Array.from(scopeSet).join(' ');

  const { code_verifier, code_challenge } = await createPkcePair();
  const state = crypto.randomUUID();

  const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    code_challenge_method: 'S256',
    code_challenge,
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set('spotify_code_verifier', code_verifier, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600
  });
  res.cookies.set('spotify_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600
  });
  return res;
}
