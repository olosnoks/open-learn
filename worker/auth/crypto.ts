/**
 * Password hashing and session-token signing, using only WebCrypto (`crypto.subtle`).
 *
 * This module deliberately has no Workers-only or Hono imports so it can be unit
 * tested in plain Node (which exposes the same global `crypto`).
 */

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Password hashing: PBKDF2-SHA256, stored as `pbkdf2$<iterations>$<saltB64>$<hashB64>`
// ---------------------------------------------------------------------------

/**
 * PBKDF2 iteration count for NEW hashes.
 *
 * Trade-off: OWASP recommends 600k iterations for PBKDF2-SHA256, but Workers caps
 * PBKDF2 at 100k and the Free plan allows only 10 ms of CPU per request, and
 * WebCrypto time counts as CPU. Measured locally (Node 24 / workerd on a desktop
 * CPU) at roughly 0.12 ms per 1000 iterations, so 100k ~ 12 ms (over budget on its
 * own) and 30k ~ 3.5 ms. 30k leaves headroom for slower edge CPUs plus the rest of
 * the request (JSON, Zod, session signing) while staying well above trivially
 * brute-forceable. On a paid plan, raise this (max 100_000): the stored format is
 * self-describing, and login transparently re-hashes old hashes at the new count.
 */
export const PBKDF2_ITERATIONS = 30_000;
/** Workers rejects PBKDF2 above this; also bounds the work an attacker-chosen hash can cause. */
export const PBKDF2_MAX_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const b64urlEncode = (bytes: Uint8Array) =>
  bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

/** Constant-time byte comparison (time depends only on the lengths). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, HASH_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

type ParsedHash = { iterations: number; salt: Uint8Array; hash: Uint8Array };

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2' || !/^\d+$/.test(parts[1])) return null;
  const iterations = Number(parts[1]);
  if (iterations < 1 || iterations > PBKDF2_MAX_ITERATIONS) return null;
  try {
    const salt = b64ToBytes(parts[2]);
    const hash = b64ToBytes(parts[3]);
    if (salt.length === 0 || hash.length !== HASH_BITS / 8) return null;
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

/**
 * Returns true only if `password` matches `stored`. Malformed hashes (such as the
 * seeded dev-user's '!') never verify.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) {
    // Still do the work, so a malformed/locked hash (e.g. '!') isn't distinguishable by timing.
    await verifyPassword(password, DUMMY_HASH);
    return false;
  }
  const actual = await pbkdf2(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(actual, parsed.hash);
}

/** True when a valid stored hash was made with a different iteration count than today's. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return !!parsed && parsed.iterations !== PBKDF2_ITERATIONS;
}

/**
 * A well-formed hash of a random, discarded password. Login verifies against it when
 * the email is unknown, so response time doesn't reveal whether an account exists.
 * Hard-coded (rather than generated at startup) so it costs no extra CPU; keep its
 * iteration count in step with PBKDF2_ITERATIONS.
 */
export const DUMMY_HASH = 'pbkdf2$30000$4ZzU35d9MvChJg5HH36imQ==$QVx0sVbJF8+3kpAOxHUH0XAvm3MNtc7F1j8EGj7ifvA=';

// ---------------------------------------------------------------------------
// Session tokens: `v1.<base64url(JSON {u, e})>.<base64url(HMAC-SHA256)>`
// ---------------------------------------------------------------------------

export type SessionPayload = { userId: string; exp: number /* unix ms */ };

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, key);
  }
  return key;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify({ u: payload.userId, e: payload.exp })));
  const signed = `v1.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(signed)));
  return `${signed}.${b64urlEncode(sig)}`;
}

/** Returns the payload if the signature is valid and the token hasn't expired, else null. */
export async function verifySession(token: string, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  try {
    const sig = b64urlDecode(parts[2]);
    // crypto.subtle.verify compares in constant time.
    const ok = await crypto.subtle.verify(
      'HMAC', await hmacKey(secret), sig as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`)
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as { u?: unknown; e?: unknown };
    if (typeof data.u !== 'string' || !data.u || typeof data.e !== 'number') return null;
    if (data.e <= now) return null;
    return { userId: data.u, exp: data.e };
  } catch {
    return null;
  }
}
