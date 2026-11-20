import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shared e2e helpers for host (signed-in) flows.
 *
 * Auth is an HttpOnly session cookie. Each host gets its own BrowserContext so its
 * cookie jar is isolated; `context.request` shares that jar with the context's
 * pages. (The top-level `request` fixture has its own jar, so a user registered
 * through it would NOT be signed in for any page.)
 */

export type HostUser = { id: string; email: string; password: string; displayName: string };

let counter = 0;

/**
 * Creates a fresh browser context, registers a brand-new host account in it (via the
 * API, which sets the session cookie), and opens a page. The page starts blank; call
 * `page.goto('/quizzes')` etc. yourself. Close `context` when done if you care about
 * cleanup (Playwright closes it at the end of the test anyway).
 */
export async function registerHost(
  browser: Browser,
  opts: { displayName?: string } = {}
): Promise<{ context: BrowserContext; page: Page; user: HostUser }> {
  const context = await browser.newContext();
  const unique = `${Date.now()}-${process.pid}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
  const user = {
    email: `host-${unique}@e2e.test`,
    password: `pw-${unique}`,
    displayName: opts.displayName ?? 'E2E Host',
  };
  const res = await context.request.post('/api/auth/register', { data: user });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const page = await context.newPage();
  return { context, page, user: { id, ...user } };
}

/** Body accepted by POST /api/quizzes (see worker/api/quizzes.ts UpsertQuizSchema). */
export type QuizInput = {
  title: string;
  description?: string;
  questions: {
    prompt: string;
    timeLimitSec?: number;
    points?: number;
    type: Record<string, unknown> & { type: string };
  }[];
};

/** A one-question multiple-choice quiz: answer 1 ("Right") is correct, answer 2 ("Wrong") isn't. */
export const simpleQuiz = (title = `E2E quiz ${Date.now()}`): QuizInput => ({
  title,
  questions: [{
    prompt: 'Pick one',
    timeLimitSec: 20,
    points: 1000,
    type: {
      type: 'quiz',
      choices: [
        { id: 'a', label: 'Right', isCorrect: true },
        { id: 'b', label: 'Wrong', isCorrect: false },
      ],
    },
  }],
});

/**
 * Creates a quiz owned by the host signed in to `context` (from `registerHost`) and
 * returns its id. Defaults to `simpleQuiz()`.
 */
export async function createQuiz(context: BrowserContext, quiz: QuizInput = simpleQuiz()): Promise<string> {
  const res = await context.request.post('/api/quizzes', { data: quiz });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}
