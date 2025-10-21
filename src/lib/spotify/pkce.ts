export function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  array.forEach((v) => (result += chars[v % chars.length]));
  return result;
}
export async function sha256(plain: string) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}
export function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function createPkcePair() {
  const code_verifier = randomString(64);
  const hashed = await sha256(code_verifier);
  const code_challenge = base64url(hashed);
  return { code_verifier, code_challenge };
}
