import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { quizzes, questions } from '../db/schema';
import { QuestionConfigSchema } from '../../src/shared/schemas';
import type { AppEnv } from '../types';

export const quizzesRoute = new Hono<AppEnv>();

const UpsertQuizSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        type: QuestionConfigSchema,
        prompt: z.string().min(1).max(500),
        timeLimitSec: z.number().int().min(5).max(240).default(20),
        points: z.number().int().min(0).max(2000).default(1000),
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
  }));

quizzesRoute.get('/', async (c) => {
  const db = getDb(c.env);
  return c.json(await db.select().from(quizzes).where(eq(quizzes.ownerId, c.get('userId'))));
});

quizzesRoute.get('/:id', async (c) => {
  const db = getDb(c.env);
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, c.req.param('id')), eq(quizzes.ownerId, c.get('userId'))))
    .limit(1);
  if (!quiz) return c.json({ error: 'not found' }, 404);
  const qs = await db.select().from(questions)
    .where(eq(questions.quizId, quiz.id)).orderBy(asc(questions.order));
  return c.json({
    ...quiz,
    questions: qs.map((q) => ({ ...q, config: JSON.parse(q.config) })),
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
      description: body.description, createdAt: now, updatedAt: now,
    }),
    db.insert(questions).values(questionRows(quizId, body)),
  ]);
  return c.json({ id: quizId }, 201);
});

quizzesRoute.put('/:id', async (c) => {
  const db = getDb(c.env);
  const body = UpsertQuizSchema.parse(await c.req.json());
  const quizId = c.req.param('id');
  const [existing] = await db
    .select().from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, c.get('userId'))))
    .limit(1);
  if (!existing) return c.json({ error: 'not found' }, 404);
  await db.batch([
    db.update(quizzes)
      .set({ title: body.title, description: body.description, updatedAt: Date.now() })
      .where(eq(quizzes.id, quizId)),
    db.delete(questions).where(eq(questions.quizId, quizId)),
    db.insert(questions).values(questionRows(quizId, body)),
  ]);
  return c.json({ ok: true });
});

quizzesRoute.delete('/:id', async (c) => {
  const db = getDb(c.env);
  await db.delete(quizzes).where(
    and(eq(quizzes.id, c.req.param('id')), eq(quizzes.ownerId, c.get('userId')))
  );
  return c.json({ ok: true });
});
