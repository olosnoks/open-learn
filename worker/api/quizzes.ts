import { Hono } from 'hono';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { quizzes, questions } from '../db/schema';
import { QuestionConfigSchema } from '../../src/shared/schemas';
import type { AppEnv } from '../types';

export const quizzesRoute = new Hono<AppEnv>();

/**
 * Question images are plain https URLs (no uploads: nothing to store or pay for).
 * The trimmed value must parse as a URL with an https: scheme; an empty string
 * or null means "no image" and is stored as NULL.
 */
const ImageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => {
    if (s === '') return true;
    try { return new URL(s).protocol === 'https:'; } catch { return false; }
  }, { message: 'must be an https:// URL' })
  .nullable()
  .optional()
  .transform((s) => (s ? s : null));

const UpsertQuizSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        type: QuestionConfigSchema,
        prompt: z.string().min(1).max(500),
        timeLimitSec: z.number().int().min(5).max(240).default(20),
        points: z.number().int().min(0).max(2000).default(1000),
        imageUrl: ImageUrlSchema,
      })
    )
    .min(1),
});

type UpsertQuiz = z.infer<typeof UpsertQuizSchema>;

const questionRows = (quizId: string, body: UpsertQuiz) =>
  body.questions.map((q, i) => ({
    // Always mint ids server-side: question rows are replaced wholesale on save, and
    // trusting client ids would let a request collide with rows in another quiz.
    id: crypto.randomUUID(),
    quizId, order: i, type: q.type.type, prompt: q.prompt,
    timeLimitSec: q.timeLimitSec, points: q.points,
    config: JSON.stringify(q.type),
    imageUrl: q.imageUrl,
  }));

/** The caller's quiz row, or undefined when it doesn't exist or belongs to someone else. */
async function ownedQuiz(db: ReturnType<typeof getDb>, quizId: string, userId: string) {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, userId)))
    .limit(1);
  return quiz;
}

/** GET /api/quizzes → quiz rows plus `questionCount`, newest first, in one query (LEFT JOIN + GROUP BY). */
quizzesRoute.get('/', async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      createdAt: quizzes.createdAt,
      updatedAt: quizzes.updatedAt,
      questionCount: sql<number>`count(${questions.id})`.mapWith(Number),
    })
    .from(quizzes)
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .where(eq(quizzes.ownerId, c.get('userId')))
    .groupBy(quizzes.id)
    .orderBy(desc(quizzes.updatedAt));
  return c.json(rows);
});

quizzesRoute.get('/:id', async (c) => {
  const db = getDb(c.env);
  const quiz = await ownedQuiz(db, c.req.param('id'), c.get('userId'));
  if (!quiz) return c.json({ error: 'not found' }, 404);
  const qs = await db.select().from(questions)
    .where(eq(questions.quizId, quiz.id)).orderBy(asc(questions.order));
  return c.json({
    ...quiz,
    questions: qs.map((q) => ({ ...q, config: JSON.parse(q.config), imageUrl: q.imageUrl ?? null })),
  });
});

quizzesRoute.post('/', async (c) => {
  const db = getDb(c.env);
  const body = UpsertQuizSchema.parse(await c.req.json());
  const quizId = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.insert(quizzes).values({
      id: quizId, ownerId: c.get('userId'), title: body.title,
      description: body.description || null, createdAt: now, updatedAt: now,
    }),
    db.insert(questions).values(questionRows(quizId, body)),
  ]);
  return c.json({ id: quizId }, 201);
});

/**
 * POST /api/quizzes/:id/duplicate → 201 { id, title }. Copies the quiz row and every
 * question (fresh ids, same order, config and image) under the caller, titled "<title> (copy)".
 */
quizzesRoute.post('/:id/duplicate', async (c) => {
  const db = getDb(c.env);
  const userId = c.get('userId');
  const source = await ownedQuiz(db, c.req.param('id'), userId);
  if (!source) return c.json({ error: 'not found' }, 404);
  const qs = await db.select().from(questions)
    .where(eq(questions.quizId, source.id)).orderBy(asc(questions.order));

  const quizId = crypto.randomUUID();
  const now = Date.now();
  const title = `${source.title} (copy)`.slice(0, 120);
  const insertQuiz = db.insert(quizzes).values({
    id: quizId, ownerId: userId, title,
    description: source.description, createdAt: now, updatedAt: now,
  });
  const copies = qs.map((q, i) => ({
    id: crypto.randomUUID(), quizId, order: i, type: q.type, prompt: q.prompt,
    timeLimitSec: q.timeLimitSec, points: q.points, config: q.config, imageUrl: q.imageUrl,
  }));
  if (copies.length > 0) await db.batch([insertQuiz, db.insert(questions).values(copies)]);
  else await insertQuiz;
  return c.json({ id: quizId, title }, 201);
});

quizzesRoute.put('/:id', async (c) => {
  const db = getDb(c.env);
  const body = UpsertQuizSchema.parse(await c.req.json());
  const quizId = c.req.param('id');
  const existing = await ownedQuiz(db, quizId, c.get('userId'));
  if (!existing) return c.json({ error: 'not found' }, 404);
  await db.batch([
    db.update(quizzes)
      .set({ title: body.title, description: body.description || null, updatedAt: Date.now() })
      .where(eq(quizzes.id, quizId)),
    db.delete(questions).where(eq(questions.quizId, quizId)),
    db.insert(questions).values(questionRows(quizId, body)),
  ]);
  return c.json({ ok: true });
});

quizzesRoute.delete('/:id', async (c) => {
  const db = getDb(c.env);
  const existing = await ownedQuiz(db, c.req.param('id'), c.get('userId'));
  if (!existing) return c.json({ error: 'not found' }, 404);
  await db.delete(quizzes).where(eq(quizzes.id, existing.id));
  return c.json({ ok: true });
});
