import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * Per-IP throttle for the credential endpoints (login, register), backed by the Workers
 * rate limiting binding declared as `ratelimits` in wrangler.jsonc: 1 request per 60 s.
 *
 * Skipped for loopback clients so local development and the e2e suite (which register and
 * log in many hosts per minute from 127.0.0.1) keep working. Cloudflare never reports a
 * loopback address as the visitor IP in production, so the skip has no effect there.
 */
export const RATE_LIMITED_MESSAGE = 'Too many attempts from your network. Try again in a minute.';

export function clientIp(c: Context<AppEnv>): string | null {
  return c.req.header('cf-connecting-ip') ?? null;
}

export function isLoopback(ip: string | null): boolean {
  return !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function authRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter = c.env.AUTH_LIMITER;
    const ip = clientIp(c);
    if (!limiter || isLoopback(ip)) return next();
    const { success } = await limiter.limit({ key: ip as string });
    if (!success) {
      c.header('Retry-After', '60');
      return c.json({ error: RATE_LIMITED_MESSAGE }, 429);
    }
    return next();
  };
}
