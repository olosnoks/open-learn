import { z } from 'zod';

export const QuestionType = z.enum([
  'quiz', 'true_false', 'type_answer', 'puzzle', 'poll',
  'slide', 'multi_select', 'slider', 'drop_pin', 'scale',
]);
export type QuestionType = z.infer<typeof QuestionType>;

const Choice = z.object({
  id: z.string(),
  label: z.string(),
  isCorrect: z.boolean(),
});

export const QuestionConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quiz'), choices: z.array(Choice).min(2).max(4) }),
  z.object({ type: z.literal('true_false'), correct: z.boolean() }),
  z.object({
    type: z.literal('type_answer'),
    acceptedAnswers: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('puzzle'),
    items: z.array(z.object({ id: z.string(), label: z.string() })).min(3),
    correctOrder: z.array(z.string()).min(3),
  }),
  z.object({
    type: z.literal('poll'),
    choices: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  }),
  z.object({ type: z.literal('slide'), body: z.string() }),
  z.object({
    type: z.literal('multi_select'),
    choices: z.array(Choice).min(2).max(6),
    partialCredit: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('slider'),
    min: z.number(), max: z.number(), step: z.number().default(1),
    correct: z.number().optional(), tolerance: z.number().default(0),
  }),
  z.object({
    type: z.literal('drop_pin'),
    imageUrl: z.string().url(),
    correctX: z.number().min(0).max(1),
    correctY: z.number().min(0).max(1),
    tolerance: z.number().min(0).max(1).default(0.1),
  }),
  z.object({
    type: z.literal('scale'),
    minLabel: z.string(), maxLabel: z.string(),
    steps: z.number().int().min(3).max(7).default(5),
  }),
]);

export type QuestionConfig = z.infer<typeof QuestionConfigSchema>;

/**
 * Per-game options chosen by the host when creating a room (Kahoot's "game options").
 * Stored in game_sessions.settings_json and sent to every client in GameSnapshot.settings.
 */
export const RoomSettingsSchema = z.object({
  /** Play questions in a random order (slides keep their relative position is NOT required). */
  shuffleQuestions: z.boolean().default(false),
  /** Shuffle answer order for quiz / multi_select / poll questions, per game. */
  shuffleAnswers: z.boolean().default(false),
  /** false = players see only the four coloured shapes (classic Kahoot); true = answer text on phones too. */
  showAnswersOnDevices: z.boolean().default(true),
  /** Players get a random friendly nickname instead of typing their own. */
  nicknameGenerator: z.boolean().default(false),
  /** Room advances through reveal and scoreboard on its own, so the host can sit back. */
  autoAdvance: z.boolean().default(false),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;
export const DEFAULT_ROOM_SETTINGS: RoomSettings = RoomSettingsSchema.parse({});

// The room code is carried by the WebSocket URL (/ws/room/:code), so JOIN doesn't repeat it.
export const JoinPayloadSchema = z.object({
  type: z.literal('JOIN'),
  nickname: z.string().trim().min(1).max(20),
  teamId: z.string().max(32).optional(),
});

export const AnswerPayloadSchema = z.object({
  type: z.literal('ANSWER'),
  questionId: z.string().max(64),
  answer: z.unknown(),
});

const HostToken = z.string().min(1).max(64);

/** Every inbound WebSocket message must parse against this before the room acts on it. */
export const ClientEventSchema = z.discriminatedUnion('type', [
  JoinPayloadSchema,
  z.object({ type: z.literal('RECONNECT'), playerId: z.string().max(64) }),
  AnswerPayloadSchema,
  z.object({ type: z.literal('HOST_START'), hostToken: HostToken }),
  z.object({ type: z.literal('HOST_NEXT'), hostToken: HostToken }),
  z.object({ type: z.literal('HOST_SKIP'), hostToken: HostToken }),
  z.object({ type: z.literal('HOST_PAUSE'), hostToken: HostToken }),
  z.object({ type: z.literal('HOST_RESUME'), hostToken: HostToken }),
  z.object({ type: z.literal('HOST_KICK'), hostToken: HostToken, playerId: z.string().max(64) }),
  z.object({ type: z.literal('HOST_END'), hostToken: HostToken }),
]);
