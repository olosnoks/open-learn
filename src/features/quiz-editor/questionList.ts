import type { QuestionType } from '../../shared/schemas';

/**
 * Pure helpers for the quiz editor's question list (no React, no DOM): reorder,
 * duplicate with fresh ids, dirty tracking, Kahoot-style quick picks and the
 * image-URL rule shared with the Worker. Unit tested in tests/unit/questionList.test.ts.
 */

export type EditorQuestion = {
  id?: string;
  type: QuestionType;
  prompt: string;
  timeLimitSec: number;
  points: number;
  config: any;
  /** Optional https image shown with the question. '' / undefined = none. */
  imageUrl?: string | null;
};

/** Kahoot's time-limit quick picks, in seconds. */
export const TIME_PRESETS = [5, 10, 20, 30, 60, 90, 120, 240] as const;

/** Kahoot's points quick picks. The free number input stays available for anything else. */
export const POINTS_PRESETS = [
  { label: 'Standard', value: 1000 },
  { label: 'Double', value: 2000 },
  { label: 'No points', value: 0 },
] as const;

/** Short badge text for the collapsed question list. */
export const TYPE_BADGE: Record<QuestionType, string> = {
  quiz: 'Quiz',
  true_false: 'T/F',
  type_answer: 'Type',
  puzzle: 'Puzzle',
  poll: 'Poll',
  slide: 'Slide',
  multi_select: 'Multi',
  slider: 'Slider',
  drop_pin: 'Pin',
  scale: 'Scale',
};

/** Same rule as the Worker's ImageUrlSchema: empty is fine, otherwise a parseable https:// URL. */
export function isValidImageUrl(value: string | null | undefined): boolean {
  const s = (value ?? '').trim();
  if (s === '') return true;
  if (s.length > 2048) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
}

/** Move the item at `from` to position `to`. Out-of-range or no-op moves return the same array. */
export function moveQuestion<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list as T[];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const defaultMakeId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

/**
 * Deep-copies a question for "Duplicate". Choice / puzzle-item ids are minted afresh and
 * the puzzle's correctOrder is remapped, so two questions never share answer ids. The
 * row id is dropped (the server mints ids on save anyway).
 */
export function duplicateQuestion(q: EditorQuestion, makeId: () => string = defaultMakeId): EditorQuestion {
  const config = structuredClone(q.config);
  if (Array.isArray(config?.choices)) {
    config.choices = config.choices.map((c: { id?: string }) => ({ ...c, id: makeId() }));
  }
  if (Array.isArray(config?.items)) {
    const idMap = new Map<string, string>();
    config.items = config.items.map((it: { id: string }) => {
      const id = makeId();
      idMap.set(it.id, id);
      return { ...it, id };
    });
    if (Array.isArray(config.correctOrder)) {
      config.correctOrder = config.correctOrder.map((old: string) => idMap.get(old) ?? old);
    }
  }
  const { id: _dropped, ...rest } = q;
  return { ...rest, config };
}

/** Insert `item` right after index `after`. */
export function insertAfter<T>(list: readonly T[], after: number, item: T): T[] {
  const i = Math.max(-1, Math.min(after, list.length - 1));
  return [...list.slice(0, i + 1), item, ...list.slice(i + 1)];
}

export type QuizDraft = { title: string; description: string; questions: EditorQuestion[] };

/**
 * Canonical string for dirty tracking: ids are ignored (the server reassigns them) and
 * an absent image is the same as an empty one. Compare two snapshots with ===.
 */
export function draftSnapshot(d: QuizDraft): string {
  return JSON.stringify({
    title: d.title,
    description: d.description,
    questions: d.questions.map(({ id: _id, imageUrl, ...q }) => ({ ...q, imageUrl: imageUrl || '' })),
  });
}

/** The body PUT/POST /api/quizzes expects for one editor question. */
export function toApiQuestion(q: EditorQuestion) {
  return {
    type: q.config,
    prompt: q.prompt,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    imageUrl: q.imageUrl?.trim() || null,
  };
}
