/**
 * Server-side half of the password-protection protocol (see
 * apps/interactive-link for the verification side). The client already ran
 * an expensive PBKDF2 pass; this is a cheap HMAC using the link's own slug as
 * key — not a secret, just enough to make the stored verifier link-specific
 * so the same password on two links doesn't produce the same stored value.
 * This is a convenience/privacy feature, not a security boundary.
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

/**
 * Turns the client wire format `{salt}:{verifier}` (single colon) into the
 * durable storage format `{salt}::{hmac}` (double colon). The caller is
 * expected to have already validated `clientPayload`'s shape (see
 * `assertValidPasswordVerifierPayload`).
 */
export async function buildStoredVerifier(slug: string, clientPayload: string): Promise<string> {
  const idx = clientPayload.indexOf(':');
  const salt = clientPayload.slice(0, idx);
  const verifier = clientPayload.slice(idx + 1);
  const hmac = await hmacVerifier(slug, verifier);
  return `${salt}::${hmac}`;
}
