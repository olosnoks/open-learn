import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import {
  DUMMY_HASH, hashPassword, needsRehash, signSession, verifyPassword, verifySession,
} from '../auth/crypto';
import type { AppEnv } from '../types';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const MIN_SECRET_LENGTH = 32;

/** The signing secret, or null (after logging why) if it's missing/too short. Callers fail closed. */
function getSecret(c: Context<AppEnv>): string | null {
  const secret = c.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `SESSION_SECRET is ${secret ? 'shorter than 32 characters' : 'not set'}; refusing to handle auth. ` +
      'Set it with `npx wrangler secret put SESSION_SECRET` (or in .dev.vars locally).'
    );
    return null;
  }
  return secret;
}

const misconfigured = (c: Context<AppEnv>) => c.json({ error: 'server misconfigured' }, 500);

async function startSession(c: Context<AppEnv>, userId: string, secret: string) {
  const token = await signSession({ userId, exp: Date.now() + SESSION_TTL_SEC * 1000 }, secret);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
    secure: new URL(c.req.url).protocol === 'https:',
  });
}

/** Verifies the signed session cookie and sets `userId`. 401 without a valid one. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const secret = getSecret(c);
  if (!secret) return misconfigured(c);
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await verifySession(token, secret) : null;
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', session.userId);
  await next();
};

/**
 * CSRF defence for state-changing requests: reject when an Origin header is present
 * and doesn't match this host. Requests without Origin (same-origin GETs, non-browser
 * clients) pass; SameSite=Lax keeps the cookie off cross-site subrequests anyway.
 */
export const checkOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = c.req.header('Origin');
    if (origin !== undefined) {
      let originHost: string | null = null;
      try { originHost = new URL(origin).host; } catch { /* "null" or garbage */ }
      if (originHost !== new URL(c.req.url).host) return c.json({ error: 'cross-origin request rejected' }, 403);
    }
  }
  await next();
};

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(8).max(128);

const RegisterSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(40),
});
const LoginSchema = z.object({ email, password: z.string().min(1).max(128) });

export const authRoute = new Hono<AppEnv>();

authRoute.post('/register', async (c) => {
  const secret = getSecret(c);
  if (!secret) return misconfigured(c);
  const body = RegisterSchema.parse(await c.req.json().catch(() => ({})));
  const db = getDb(c.env);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
  if (existing) return c.json({ error: 'Could not create an account with that email' }, 409);

  const id = crypto.randomUUID();
  try {
    await db.insert(users).values({
      id, email: body.email, passwordHash: await hashPassword(body.password),
      displayName: body.displayName, createdAt: Date.now(),
    });
  } catch (err) {
    // Lost a race with a concurrent registration for the same email (UNIQUE constraint).
    if (String(err).includes('UNIQUE')) return c.json({ error: 'Could not create an account with that email' }, 409);
    throw err;
  }
  await startSession(c, id, secret);
  return c.json({ id, email: body.email, displayName: body.displayName }, 201);
});

authRoute.post('/login', async (c) => {
  const secret = getSecret(c);
  if (!secret) return misconfigured(c);
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
  const invalid = () => c.json({ error: 'Invalid email or password' }, 401);
  if (!parsed.success) return invalid();
  const { email, password } = parsed.data;
  const db = getDb(c.env);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Hash even for unknown emails so response time doesn't reveal which accounts exist.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return invalid();

  if (needsRehash(user.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  }
  await startSession(c, user.id, secret);
  return c.json({ id: user.id, email: user.email, displayName: user.displayName });
});

authRoute.post('/logout', (c) => {
  // Sessions are stateless, so logging out just clears the cookie in this browser.
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
  return c.json({ ok: true });
});

authRoute.get('/me', requireAuth, async (c) => {
  const db = getDb(c.env);
  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users).where(eq(users.id, c.get('userId'))).limit(1);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json(user);
});
