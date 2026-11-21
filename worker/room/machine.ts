import type { QuestionConfig, RoomSettings } from '../../src/shared/schemas';
import type { WireQuestion, PublicConfig, CorrectAnswer, GamePhase } from '../../src/shared/types';
import { generateNickname } from '../../src/shared/nicknames';

export type StoredQuestion = {
  id: string;
  order: number;
  type: QuestionConfig['type'];
  prompt: string;
  timeLimitSec: number;
  points: number;
  config: QuestionConfig;
  imageUrl?: string | null;
};

/** Question types that never award points or affect streaks. */
export const UNSCORED_TYPES: ReadonlySet<QuestionConfig['type']> = new Set(['poll', 'slide', 'scale']);

/** Fisher-Yates on a copy. `rand` is injectable for deterministic tests. */
export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Game option "shuffle questions": random play order, decided once at room init and persisted.
 * Slides keep their original positions (they are usually section breaks or instructions);
 * every other question is shuffled among the remaining slots.
 */
export function shuffleQuestionOrder(
  questions: readonly StoredQuestion[], rand: () => number = Math.random
): StoredQuestion[] {
  const movable = shuffle(questions.filter((q) => q.type !== 'slide'), rand);
  let k = 0;
  return questions.map((q) => (q.type === 'slide' ? q : movable[k++]));
}

/**
 * Decides the display order of a question's choices (or puzzle pieces) when it starts. The room
 * stores the returned ids in state and passes them to every toWireQuestion() call, so the host
 * screen, every phone, and every reconnect see the same order. Returns null when the question
 * is shown in authored order. Puzzles are always shuffled: showing the pieces in the correct
 * order would give the answer away.
 */
export function pickChoiceOrder(
  q: StoredQuestion, settings: Pick<RoomSettings, 'shuffleAnswers'>, rand: () => number = Math.random
): string[] | null {
  const c = q.config;
  if (c.type === 'puzzle') return shuffle(c.items, rand).map((i) => i.id);
  if (!settings.shuffleAnswers) return null;
  if (c.type === 'quiz' || c.type === 'multi_select' || c.type === 'poll') {
    return shuffle(c.choices, rand).map((ch) => ch.id);
  }
  return null;
}

/** Reorders `items` to follow `order` (ids). Ids missing from `order` keep their place at the end. */
function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | null | undefined): T[] {
  if (!order || order.length === 0) return [...items];
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const out: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) { out.push(item); byId.delete(id); }
  }
  for (const item of byId.values()) out.push(item);
  return out;
}

function publicConfig(c: QuestionConfig, order?: readonly string[] | null): PublicConfig {
  switch (c.type) {
    case 'quiz':
    case 'multi_select':
      return { type: c.type, choices: applyOrder(c.choices, order).map(({ id, label }) => ({ id, label })) };
    case 'poll':
      return { type: 'poll', choices: applyOrder(c.choices, order) };
    case 'true_false': return { type: 'true_false' };
    case 'type_answer': return { type: 'type_answer' };
    // No stored order (room state from before choiceOrder existed): fresh shuffle rather than leak the answer.
    case 'puzzle': return { type: 'puzzle', items: order ? applyOrder(c.items, order) : shuffle(c.items) };
    case 'slide': return { type: 'slide', body: c.body };
    case 'slider': return { type: 'slider', min: c.min, max: c.max, step: c.step };
    case 'drop_pin': return { type: 'drop_pin', imageUrl: c.imageUrl };
    case 'scale': return { type: 'scale', minLabel: c.minLabel, maxLabel: c.maxLabel, steps: c.steps };
  }
}

/** `choiceOrder` is the current question's order from pickChoiceOrder(); omit for authored order. */
export function toWireQuestion(q: StoredQuestion, index: number, choiceOrder?: readonly string[] | null): WireQuestion {
  return {
    id: q.id, index, type: q.type, prompt: q.prompt,
    timeLimitSec: q.timeLimitSec, points: q.points, config: publicConfig(q.config, choiceOrder),
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
  };
}

const norm = (s: string) => s.trim().toLowerCase();

export function evaluateAnswer(q: StoredQuestion, answer: unknown): boolean {
  const c = q.config;
  switch (c.type) {
    case 'quiz':
      return typeof answer === 'string' && c.choices.some((ch) => ch.id === answer && ch.isCorrect);
    case 'true_false':
      return answer === c.correct;
    case 'type_answer': {
      if (typeof answer !== 'string') return false;
      const candidate = c.caseSensitive ? answer.trim() : norm(answer);
      return c.acceptedAnswers.some((a) => (c.caseSensitive ? a.trim() : norm(a)) === candidate);
    }
    case 'puzzle':
      if (!Array.isArray(answer)) return false;
      return answer.length === c.correctOrder.length && answer.every((id, i) => id === c.correctOrder[i]);
    case 'poll': case 'slide': case 'scale':
      return false;
    case 'multi_select': {
      if (!Array.isArray(answer) || !answer.every((a) => typeof a === 'string')) return false;
      const selected = new Set(answer as string[]);
      const correctIds = c.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id);
      if (selected.size !== correctIds.length) return false;
      return correctIds.every((id) => selected.has(id));
    }
    case 'slider':
      if (typeof c.correct !== 'number' || typeof answer !== 'number' || !Number.isFinite(answer)) return false;
      return Math.abs(answer - c.correct) <= c.tolerance;
    case 'drop_pin': {
      if (typeof answer !== 'object' || answer === null) return false;
      const a = answer as { x: unknown; y: unknown };
      if (typeof a.x !== 'number' || typeof a.y !== 'number') return false;
      return Math.hypot(a.x - c.correctX, a.y - c.correctY) <= c.tolerance;
    }
  }
}

export function getCorrectAnswer(q: StoredQuestion): CorrectAnswer {
  const c = q.config;
  switch (c.type) {
    case 'quiz':
    case 'multi_select':
      return { type: 'choice', ids: c.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id) };
    case 'true_false': return { type: 'choice', ids: [String(c.correct)] };
    case 'type_answer': return { type: 'text', accepted: c.acceptedAnswers };
    case 'puzzle': return { type: 'puzzle', order: c.correctOrder };
    case 'slider':
      return typeof c.correct === 'number'
        ? { type: 'number', value: c.correct, tolerance: c.tolerance }
        : { type: 'none' };
    case 'drop_pin': return { type: 'pin', x: c.correctX, y: c.correctY, tolerance: c.tolerance };
    case 'poll': case 'slide': case 'scale': return { type: 'none' };
  }
}

export type RankEntry = { id: string; name: string; score: number };
export type RankResult = { rank: number; total: number; score: number; behind?: { name: string; points: number } };

/**
 * Ranks entries by score (desc), ties broken by name for a stable order. Ties share a rank
 * (competition ranking: 1, 2, 2, 4). `behind` is the closest entry with a strictly higher
 * score and the gap to it, so 1st place (including a shared 1st) has no `behind`.
 */
export function rankEntries(entries: readonly RankEntry[]): Map<string, RankResult> {
  const sorted = [...entries].sort(
    (a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
  const out = new Map<string, RankResult>();
  let groupStart = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].score !== sorted[i - 1].score) groupStart = i;
    const e = sorted[i];
    const above = groupStart > 0 ? sorted[groupStart - 1] : undefined;
    out.set(e.id, {
      rank: groupStart + 1,
      total: sorted.length,
      score: e.score,
      ...(above ? { behind: { name: above.name, points: above.score - e.score } } : {}),
    });
  }
  return out;
}

// --- Nickname generator --------------------------------------------------------------------------

/** Random generated nicknames are retried this many times before a number suffix is appended. */
export const NICKNAME_ATTEMPTS = 10;

/**
 * Game option "nickname generator": picks a unique friendly nickname for a joining player.
 * `isTaken` answers whether a nickname is already in the room. After NICKNAME_ATTEMPTS
 * collisions the last candidate gets a numeric suffix ("Brave Otter 2", "Brave Otter 3", ...),
 * which always terminates and stays within the 20-char nickname limit for every list entry.
 */
export function assignNickname(isTaken: (name: string) => boolean, rand: () => number = Math.random): string {
  let candidate = generateNickname(rand);
  for (let i = 0; i < NICKNAME_ATTEMPTS; i++) {
    if (!isTaken(candidate)) return candidate;
    candidate = generateNickname(rand);
  }
  for (let n = 2; ; n++) {
    const suffixed = `${candidate} ${n}`;
    if (!isTaken(suffixed)) return suffixed;
  }
}

// --- Auto-advance ------------------------------------------------------------------------------

/** How long the room lingers on the answer reveal, then on the scoreboard, before the next question. */
export const AUTO_ADVANCE_REVEAL_MS = 5_000;
export const AUTO_ADVANCE_SCOREBOARD_MS = 5_000;

/**
 * Where an auto-advancing room is within the reveal phase. On the wire the phase stays 'reveal'
 * for both stages (QUESTION_REVEALED already carries the standings, so existing screens need
 * nothing new); the stage only drives the alarm. `at` is when the stage ends (epoch ms).
 */
export type AutoAdvanceStage = { stage: 'reveal' | 'scoreboard'; at: number };

export type AutoAdvanceAction =
  | { kind: 'none' }
  | { kind: 'scoreboard'; at: number }
  | { kind: 'next' }
  | { kind: 'finish' };

/** The stage to enter right after a question is revealed, or null when the option is off. */
export function autoAdvanceAfterReveal(
  settings: Pick<RoomSettings, 'autoAdvance'>, now: number
): AutoAdvanceStage | null {
  return settings.autoAdvance ? { stage: 'reveal', at: now + AUTO_ADVANCE_REVEAL_MS } : null;
}

/**
 * Pure alarm logic for auto-advance: given the room's phase and stage, what to do when the alarm
 * fires. Anything but an auto-advancing reveal whose stage has elapsed is 'none', so a host-driven
 * room, a running or paused question, or a finished game is never moved by a stale alarm.
 */
export function autoAdvanceStep(input: {
  phase: GamePhase;
  settings: Pick<RoomSettings, 'autoAdvance'>;
  stage: AutoAdvanceStage | null | undefined;
  currentIndex: number;
  total: number;
  now: number;
}): AutoAdvanceAction {
  const { phase, settings, stage, currentIndex, total, now } = input;
  if (phase !== 'reveal' || !settings.autoAdvance || !stage) return { kind: 'none' };
  if (now < stage.at) return { kind: 'none' };
  if (stage.stage === 'reveal') return { kind: 'scoreboard', at: now + AUTO_ADVANCE_SCOREBOARD_MS };
  return currentIndex + 1 >= total ? { kind: 'finish' } : { kind: 'next' };
}
