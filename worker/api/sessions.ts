import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { count, countDistinct, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { quizzes, questions, gameSessions, sessionAnswers } from '../db/schema';
import { DEFAULT_ROOM_SETTINGS, RoomSettingsSchema, type RoomSettings } from '../../src/shared/schemas';
import type { StoredQuestion } from '../room/machine';
import { generateRoomCode } from '../room/roomCode';
import type { AppEnv } from '../types';

export const sessionsRoute = new Hono<AppEnv>();

const CreateSessionSchema = z.object({
  quizId: z.string(),
  mode: z.enum(['classic', 'accuracy', 'lecture']).default('classic'),
  isTeam: z.boolean().default(false),
  teamCount: z.number().int().min(2).max(4).default(2),
  /** Game options; anything omitted falls back to DEFAULT_ROOM_SETTINGS. */
  settings: RoomSettingsSchema.partial().optional(),
});

sessionsRoute.post('/', async (c) => {
  const db = getDb(c.env);
  const userId = c.get('userId');
  const { quizId, mode, isTeam, teamCount, settings: partial } = CreateSessionSchema.parse(await c.req.json());
  const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...(partial ?? {}) };

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
    imageUrl: q.imageUrl ?? null,
  }));

  const id = c.env.ROOM.idFromName(roomCode);
  const initRes = await c.env.ROOM.get(id).fetch(
    new Request('https://do/init', {
      method: 'POST',
      body: JSON.stringify({
        sessionId, hostId: userId, hostToken, roomCode, mode, isTeam, teamCount, settings,
        questions: storedQuestions,
      }),
    })
  );
  if (!initRes.ok) return c.json({ error: 'room init failed' }, 500);

  await db.insert(gameSessions).values({
    id: sessionId, quizId, hostId: userId, roomCode, mode, startedAt: Date.now(),
    settingsJson: JSON.stringify(settings),
  });

  return c.json({ sessionId, roomCode, hostToken }, 201);
});

/** Question types that never award points; excluded from accuracy (mirrors UNSCORED_TYPES). */
const UNSCORED_TYPES = ['poll', 'slide', 'scale'];

/**
 * GET /api/sessions — history list, newest first. Two queries total (no N+1):
 * sessions joined to their quiz title, and one aggregate over session_answers for the
 * host's sessions. Player count / team flag come from summary_json via SQLite JSON1.
 */
sessionsRoute.get('/', async (c) => {
  const db = getDb(c.env);
  const userId = c.get('userId');

  const ownSessionIds = db.select({ id: gameSessions.id }).from(gameSessions)
    .where(eq(gameSessions.hostId, userId));

  const [rows, agg] = await Promise.all([
    db.select({
      id: gameSessions.id,
      quizId: gameSessions.quizId,
      quizTitle: quizzes.title,
      roomCode: gameSessions.roomCode,
      mode: gameSessions.mode,
      startedAt: gameSessions.startedAt,
      endedAt: gameSessions.endedAt,
      isTeam: sql<number | null>`json_extract(${gameSessions.summaryJson}, '$.isTeam')`,
      playerCount: sql<number | null>`json_array_length(${gameSessions.summaryJson}, '$.players')`,
    })
      .from(gameSessions)
      .leftJoin(quizzes, eq(quizzes.id, gameSessions.quizId))
      .where(eq(gameSessions.hostId, userId))
      .orderBy(desc(gameSessions.startedAt)),
    db.select({
      sessionId: sessionAnswers.sessionId,
      answerCount: count(),
      correctCount: sql<number>`coalesce(sum(${sessionAnswers.isCorrect}), 0)`,
      askedCount: countDistinct(sessionAnswers.questionId),
    })
      .from(sessionAnswers)
      .leftJoin(questions, eq(questions.id, sessionAnswers.questionId))
      .where(and(
        inArray(sessionAnswers.sessionId, ownSessionIds),
        // A deleted question (NULL type) is treated as scored.
        or(isNull(questions.type), notInArray(questions.type, UNSCORED_TYPES)),
      ))
      .groupBy(sessionAnswers.sessionId),
  ]);

  const aggById = new Map(agg.map((a) => [a.sessionId, a] as const));
  return c.json(rows.map((r) => {
    const a = aggById.get(r.id);
    return {
      ...r,
      isTeam: Boolean(r.isTeam),
      playerCount: r.playerCount ?? null,
      answerCount: a?.answerCount ?? 0,
      correctCount: Number(a?.correctCount ?? 0),
      askedCount: a?.askedCount ?? 0,
    };
  }));
});

sessionsRoute.get('/:id', async (c) => {
  const db = getDb(c.env);
  const [row] = await db.select().from(gameSessions)
    .where(and(eq(gameSessions.id, c.req.param('id')), eq(gameSessions.hostId, c.get('userId'))))
    .limit(1);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/**
 * GET /api/sessions/:id/report — everything the client needs to build the report:
 * the session (with quiz title), the quiz's questions (config included, so the report
 * can label options and mark the correct one) and every stored answer. Three queries,
 * one per table; the report math itself lives in src/features/results/report.ts.
 */
sessionsRoute.get('/:id/report', async (c) => {
  const db = getDb(c.env);
  const sessionId = c.req.param('id');

  const [row] = await db.select({ session: gameSessions, quizTitle: quizzes.title })
    .from(gameSessions)
    .leftJoin(quizzes, eq(quizzes.id, gameSessions.quizId))
    .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.hostId, c.get('userId'))))
    .limit(1);
  if (!row) return c.json({ error: 'not found' }, 404);

  const [qs, answers] = await Promise.all([
    db.select({
      id: questions.id, order: questions.order, type: questions.type,
      prompt: questions.prompt, points: questions.points, config: questions.config,
    }).from(questions).where(eq(questions.quizId, row.session.quizId)).orderBy(asc(questions.order)),
    db.select().from(sessionAnswers).where(eq(sessionAnswers.sessionId, sessionId)),
  ]);

  return c.json({
    session: { ...row.session, quizTitle: row.quizTitle ?? null },
    questions: qs.map((q) => {
      let config: unknown = null;
      try { config = JSON.parse(q.config); } catch { /* keep null */ }
      return { ...q, config };
    }),
    answers,
  });
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
