import { describe, expect, it } from 'vitest';
import { authRateLimit, isLoopback, RATE_LIMITED_MESSAGE } from '../../worker/auth/rateLimit';

describe('isLoopback', () => {
  it('treats missing and loopback addresses as local', () => {
    expect(isLoopback(null)).toBe(true);
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
  });
  it('treats public addresses as remote', () => {
    expect(isLoopback('203.0.113.9')).toBe(false);
    expect(isLoopback('2001:db8::1')).toBe(false);
  });
});

/** Minimal stand-ins for Hono's context: just what the middleware touches. */
function fakeContext(ip: string | undefined, limiter: { limit: (o: { key: string }) => Promise<{ success: boolean }> } | undefined) {
  const headers: Record<string, string> = {};
  let status = 200; let body: unknown = null;
  const c = {
    env: { AUTH_LIMITER: limiter },
    req: { header: (name: string) => (name === 'cf-connecting-ip' ? ip : undefined) },
    header: (k: string, v: string) => { headers[k] = v; },
    json: (b: unknown, s: number) => { body = b; status = s; return { body, status }; },
  };
  return { c: c as never, result: () => ({ headers, status, body }) };
}

describe('authRateLimit', () => {
  it('lets a request through when the limiter allows it', async () => {
    const keys: string[] = [];
    const { c } = fakeContext('203.0.113.9', { limit: async ({ key }) => { keys.push(key); return { success: true }; } });
    let called = false;
    await authRateLimit()(c, async () => { called = true; });
    expect(called).toBe(true);
    expect(keys).toEqual(['203.0.113.9']);
  });

  it('answers 429 with Retry-After when the limiter refuses', async () => {
    const { c, result } = fakeContext('203.0.113.9', { limit: async () => ({ success: false }) });
    let called = false;
    await authRateLimit()(c, async () => { called = true; });
    expect(called).toBe(false);
    expect(result().status).toBe(429);
    expect(result().headers['Retry-After']).toBe('60');
    expect(result().body).toEqual({ error: RATE_LIMITED_MESSAGE });
  });

  it('skips loopback clients and missing bindings', async () => {
    let limiterCalls = 0;
    const limiter = { limit: async () => { limiterCalls++; return { success: false }; } };
    for (const [ip, l] of [['127.0.0.1', limiter], ['203.0.113.9', undefined]] as const) {
      const { c } = fakeContext(ip, l);
      let called = false;
      await authRateLimit()(c, async () => { called = true; });
      expect(called).toBe(true);
    }
    expect(limiterCalls).toBe(0);
  });
});
