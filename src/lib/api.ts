// Auth is a same-origin HttpOnly session cookie, which fetch sends automatically.
const JSON_HEADERS = { 'content-type': 'application/json' };

export type Me = { id: string; email: string; displayName: string };

/**
 * Only same-site paths are acceptable redirect targets: a single leading "/" and not
 * "//host" or "/\host" (which browsers treat as protocol-relative). Anything else
 * falls back to the quiz list.
 */
export function safeNext(next: string | null | undefined, fallback = '/quizzes'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export const loginPath = (next = window.location.pathname + window.location.search) =>
  `/login?next=${encodeURIComponent(next)}`;

async function fail(method: string, path: string, res: Response): Promise<never> {
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    // Session missing or expired: send the host to log in, then back here.
    window.location.assign(loginPath());
  }
  let detail = '';
  try {
    const body = (await res.json()) as { error?: string; issues?: { path: (string | number)[]; message: string }[] };
    detail = body.issues?.length
      ? body.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : body.error ?? '';
  } catch { /* not JSON */ }
  throw new Error(`${method} ${path} failed: ${res.status}${detail ? ` — ${detail}` : ''}`);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) return fail('GET', path, res);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) return fail('POST', path, res);
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) return fail('PUT', path, res);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`/api${path}`, { method: 'DELETE' });
  if (!res.ok) return fail('DELETE', path, res);
}

/** Authenticated file download, via fetch so a 401 can redirect to login instead of opening an error tab. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) return fail('GET', path, res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Auth helpers. These never redirect; callers decide what to do. ---

/** The signed-in host, or null when not signed in. */
export async function getMe(): Promise<Me | null> {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return res.json();
}

async function authPost(path: string, body: unknown): Promise<Me> {
  const res = await fetch(`/api/auth${path}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Partial<Me> & {
    error?: string; issues?: { path: (string | number)[]; message: string }[];
  };
  if (!res.ok) {
    const issue = data.issues?.[0];
    throw new Error(issue ? `${String(issue.path[0] ?? 'Input')}: ${issue.message}` : data.error ?? `Request failed (${res.status})`);
  }
  return data as Me;
}

export const login = (email: string, password: string) => authPost('/login', { email, password });

export const register = (email: string, password: string, displayName: string) =>
  authPost('/register', { email, password, displayName });

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
