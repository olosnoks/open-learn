import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { quizzes, questions, gameSessions, sessionAnswers } from '../db/schema';
import type { StoredQuestion } from '../room/machine';
import { generateRoomCode } from '../room/roomCode';
import type { AppEnv } from '../types';

export const sessionsRoute = new Hono<AppEnv>();

const CreateSessionSchema = z.object({
  quizId: z.string(),
  mode: z.enum(['classic', 'accuracy', 'lecture']).default('classic'),
  isTeam: z.boolean().default(false),
  teamCount: z.number().int().min(2).max(4).default(2),
});

sessionsRoute.post('/', async (c) => {
  const db = getDb(c.env);
  const userId = c.get('userId');
  const { quizId, mode, isTeam, teamCount } = CreateSessionSchema.parse(await c.req.json());

  const [quiz] = await db
    .select().from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, userId)))
    .limit(1);
  if (!quiz) return c.json({ error: 'not found' }, 404);

  const qs = await db.select().from(questions)
    .where(eq(questions.quizId, quizId)).orderBy(asc(questions.order));
  if (qs.length === 0) return c.json({ error: 'quiz has no questions' }, 400);

  let roomCode = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const [conflict] = await db
      .select({ id: gameSessions.id }).from(gameSessions)
      .where(eq(gameSessions.roomCode, roomCode)).limit(1);
    if (!conflict) break;
    roomCode = generateRoomCode();
  }

  const sessionId = crypto.randomUUID();
  const hostToken = crypto.randomUUID();

  const storedQuestions: StoredQuestion[] = qs.map((q) => ({
    id: q.id, order: q.order, type: q.type as StoredQuestion['type'],
    prompt: q.prompt, timeLimitSec: q.timeLimitSec, points: q.points,
    config: JSON.parse(q.config),
  }));

  const id = c.env.ROOM.idFromName(roomCode);
  const initRes = await c.env.ROOM.get(id).fetch(
    new Request('https://do/init', {
      method: 'POST',
      body: JSON.stringify({
        sessionId, hostId: userId, hostToken, roomCode, mode, isTeam, teamCount,
        questions: storedQuestions,
      }),
    })
  );
  if (!initRes.ok) return c.json({ error: 'room init failed' }, 500);

  await db.insert(gameSessions).values({
    id: sessionId, quizId, hostId: userId, roomCode, mode, startedAt: Date.now(),
  });

  return c.json({ sessionId, roomCode, hostToken }, 201);
});

sessionsRoute.get('/', async (c) => {
  const db = getDb(c.env);
  return c.json(
    await db.select().from(gameSessions)
      .where(eq(gameSessions.hostId, c.get('userId')))
      .orderBy(desc(gameSessions.startedAt))
  );
});

sessionsRoute.get('/:id', async (c) => {
  const db = getDb(c.env);
  const [row] = await db.select().from(gameSessions)
    .where(and(eq(gameSessions.id, c.req.param('id')), eq(gameSessions.hostId, c.get('userId'))))
    .limit(1);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

sessionsRoute.get('/:id/export.csv', async (c) => {
  const db = getDb(c.env);
  const sessionId = c.req.param('id');

  const [session] = await db.select().from(gameSessions)
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.hostId, c.get('userId'))))
    .limit(1);
  if (!session) return c.json({ error: 'not found' }, 404);

  const rows = await db.select().from(sessionAnswers)
    .where(eq(sessionAnswers.sessionId, sessionId));

  const escape = (v: unknown) => {
    let s = String(v ?? '');
    // Neutralise spreadsheet formula injection from player-supplied text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = 'player_nickname,question_prompt,payload,latency_ms,is_correct,points';
  const body = rows.map((r) => [
    r.playerNickname, r.questionPrompt, r.payload, r.latencyMs, r.isCorrect, r.points,
  ].map(escape).join(',')).join('\n');

  return new Response(`${header}\n${body}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="session-${session.roomCode}.csv"`,
    },
  });
});
