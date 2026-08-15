/**
 * Same computation as admin-api's lib/password.ts — duplicated verbatim
 * rather than shared as a runtime package, matching this repo's existing
 * convention (KV encode/decode is duplicated the same way between admin-api
 * and redirect-worker).
 */
export async function hmacVerifier(slug: string, pbkdfVerifierHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(slug),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pbkdfVerifierHex));
  return toHex(new Uint8Array(sig));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
