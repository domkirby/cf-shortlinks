/** Must match the iteration count in interactive-link's page.ts inline script. */
const ITERATIONS = 210_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hex(password: string, saltBytes: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/**
 * Derives the `{salt}:{verifier}` wire payload (single colon) sent to the
 * admin API when setting or changing a link's password. A fresh random salt
 * is generated every time — see packages/shared-types's CreateLinkInput for
 * the format this feeds into.
 */
export async function derivePasswordPayload(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes);
  const verifier = await pbkdf2Hex(password, saltBytes, ITERATIONS);
  return `${salt}:${verifier}`;
}
