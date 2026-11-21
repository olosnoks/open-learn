import type { QuestionConfig } from '../../src/shared/schemas';
import type { WireQuestion, PublicConfig, CorrectAnswer } from '../../src/shared/types';

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

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function publicConfig(c: QuestionConfig): PublicConfig {
  switch (c.type) {
    case 'quiz':
    case 'multi_select':
      return { type: c.type, choices: c.choices.map(({ id, label }) => ({ id, label })) };
    case 'poll':
      return { type: 'poll', choices: c.choices };
    case 'true_false': return { type: 'true_false' };
    case 'type_answer': return { type: 'type_answer' };
    case 'puzzle': return { type: 'puzzle', items: shuffle(c.items) };
    case 'slide': return { type: 'slide', body: c.body };
    case 'slider': return { type: 'slider', min: c.min, max: c.max, step: c.step };
    case 'drop_pin': return { type: 'drop_pin', imageUrl: c.imageUrl };
    case 'scale': return { type: 'scale', minLabel: c.minLabel, maxLabel: c.maxLabel, steps: c.steps };
  }
}

export function toWireQuestion(q: StoredQuestion, index: number): WireQuestion {
  return {
    id: q.id, index, type: q.type, prompt: q.prompt,
    timeLimitSec: q.timeLimitSec, points: q.points, config: publicConfig(q.config),
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
