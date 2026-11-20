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
