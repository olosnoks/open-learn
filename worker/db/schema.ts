import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const quizzes = sqliteTable('quizzes', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  ownerIdx: index('idx_quizzes_owner').on(t.ownerId),
}));

export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  quizId: text('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  type: text('type').notNull(),
  prompt: text('prompt').notNull(),
  timeLimitSec: integer('time_limit_sec').notNull().default(20),
  points: integer('points').notNull().default(1000),
  config: text('config').notNull(),
}, (t) => ({
  quizIdx: index('idx_questions_quiz').on(t.quizId),
}));

export const gameSessions = sqliteTable('game_sessions', {
  id: text('id').primaryKey(),
  quizId: text('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  hostId: text('host_id').notNull().references(() => users.id),
  roomCode: text('room_code').notNull().unique(),
  mode: text('mode').notNull().default('classic'),
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
  summaryJson: text('summary_json'),
}, (t) => ({
  hostIdx: index('idx_sessions_host').on(t.hostId),
}));

export const sessionAnswers = sqliteTable('session_answers', {
  sessionId: text('session_id').notNull(),
  playerId: text('player_id').notNull(),
  playerNickname: text('player_nickname').notNull(),
  questionId: text('question_id').notNull(),
  questionPrompt: text('question_prompt').notNull(),
  payload: text('payload').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  isCorrect: integer('is_correct').notNull(),
  points: integer('points').notNull(),
}, (t) => ({
  sessionIdx: index('idx_session_answers_session').on(t.sessionId),
}));
