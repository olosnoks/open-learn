import { describe, expect, it } from 'vitest';
import {
  DUMMY_HASH, PBKDF2_ITERATIONS, hashPassword, needsRehash, signSession, verifyPassword, verifySession,
} from '../../worker/auth/crypto';
import { safeNext } from '../../src/lib/api';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('password hashing', () => {
  it('produces a self-describing PBKDF2 hash with a random salt', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).toMatch(new RegExp(`^pbkdf2\\$${PBKDF2_ITERATIONS}\\$[A-Za-z0-9+/=]+\\$[A-Za-z0-9+/=]+$`));
    expect(a).not.toBe(b);
  });

  it('verifies the correct password', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horsf', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('rejects tampered or malformed hashes', async () => {
    const stored = await hashPassword('correct horse');
    const [scheme, iter, salt, hash] = stored.split('$');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(await verifyPassword('correct horse', [scheme, iter, salt, flip(hash)].join('$'))).toBe(false);
    expect(await verifyPassword('correct horse', [scheme, iter, flip(salt), hash].join('$'))).toBe(false);
    expect(await verifyPassword('correct horse', [scheme, String(Number(iter) + 1), salt, hash].join('$'))).toBe(false);
    expect(await verifyPassword('correct horse', [scheme, '1000000', salt, hash].join('$'))).toBe(false);
    expect(await verifyPassword('correct horse', ['bcrypt', iter, salt, hash].join('$'))).toBe(false);
    expect(await verifyPassword('anything', '!')).toBe(false); // seeded dev-user
  });

  it('honours the iteration count stored in the hash', async () => {
    const old = await hashPassword('pw-at-1000', 1000);
    expect(await verifyPassword('pw-at-1000', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash(await hashPassword('x'))).toBe(false);
  });

  it('dummy hash is well formed and matches the current iteration count', () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });
});

describe('session tokens', () => {
  const now = 1_700_000_000_000;
  const payload = { userId: 'user-123', exp: now + 60_000 };

  it('round-trips a valid token', async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, SECRET, now)).toEqual(payload);
  });

  it('rejects a tampered payload or signature', async () => {
    const token = await signSession(payload, SECRET);
    const [v, body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'someone-else', e: payload.exp })).toString('base64url');
    expect(await verifySession(`${v}.${forged}.${sig}`, SECRET, now)).toBeNull();
    const badSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(await verifySession(`${v}.${body}.${badSig}`, SECRET, now)).toBeNull();
    expect(await verifySession(`v2.${body}.${sig}`, SECRET, now)).toBeNull();
    expect(await verifySession('garbage', SECRET, now)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, `${SECRET}-rotated`, now)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession(payload, SECRET);
    expect(await verifySession(token, SECRET, payload.exp)).toBeNull();
    expect(await verifySession(token, SECRET, payload.exp + 1)).toBeNull();
    expect(await verifySession(token, SECRET, payload.exp - 1)).toEqual(payload);
  });
});

describe('safeNext (post-login redirect)', () => {
  it('accepts same-site paths only', () => {
    expect(safeNext('/quizzes/abc?x=1')).toBe('/quizzes/abc?x=1');
    expect(safeNext(null)).toBe('/quizzes');
    expect(safeNext('')).toBe('/quizzes');
    expect(safeNext('https://evil.example')).toBe('/quizzes');
    expect(safeNext('//evil.example')).toBe('/quizzes');
    expect(safeNext('/\\evil.example')).toBe('/quizzes');
    expect(safeNext('javascript:alert(1)')).toBe('/quizzes');
  });
});
