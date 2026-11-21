import { describe, it, expect } from 'vitest';
import {
  shuffleQuestionOrder, pickChoiceOrder, toWireQuestion, evaluateAnswer, assignNickname,
  autoAdvanceAfterReveal, autoAdvanceStep, NICKNAME_ATTEMPTS,
  AUTO_ADVANCE_REVEAL_MS, AUTO_ADVANCE_SCOREBOARD_MS,
  type StoredQuestion,
} from '../../worker/room/machine';
import { isGeneratedNickname } from '../../src/shared/nicknames';
import { DEFAULT_ROOM_SETTINGS } from '../../src/shared/schemas';

/** Deterministic PRNG (mulberry32) so shuffles are reproducible in tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function q(id: string, config: StoredQuestion['config'], order = 0): StoredQuestion {
  return { id, order, type: config.type, prompt: id, timeLimitSec: 20, points: 1000, config };
}
const quiz = (id: string) => q(id, { type: 'quiz', choices: [
  { id: `${id}-a`, label: 'A', isCorrect: false },
  { id: `${id}-b`, label: 'B', isCorrect: true },
  { id: `${id}-c`, label: 'C', isCorrect: false },
  { id: `${id}-d`, label: 'D', isCorrect: false },
]});
const slide = (id: string) => q(id, { type: 'slide', body: 'intro' });

describe('shuffleQuestionOrder', () => {
  const questions = [slide('s0'), quiz('q1'), quiz('q2'), quiz('q3'), slide('s4'), quiz('q5'), quiz('q6')];

  it('keeps every question exactly once', () => {
    const out = shuffleQuestionOrder(questions, seeded(1));
    expect(out.map((x) => x.id).sort()).toEqual(questions.map((x) => x.id).sort());
  });
  it('keeps slides in their original positions', () => {
    for (let s = 0; s < 20; s++) {
      const out = shuffleQuestionOrder(questions, seeded(s));
      expect(out[0].id).toBe('s0');
      expect(out[4].id).toBe('s4');
    }
  });
  it('actually changes the order of the other questions (across seeds)', () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, s) => shuffleQuestionOrder(questions, seeded(s)).map((x) => x.id).join(','))
    );
    expect(orders.size).toBeGreaterThan(1);
  });
  it('is deterministic for a given rand, so the stored order is the played order', () => {
    const a = shuffleQuestionOrder(questions, seeded(7)).map((x) => x.id);
    const b = shuffleQuestionOrder(questions, seeded(7)).map((x) => x.id);
    expect(a).toEqual(b);
  });
  it('does not mutate the input', () => {
    const copy = questions.map((x) => x.id);
    shuffleQuestionOrder(questions, seeded(3));
    expect(questions.map((x) => x.id)).toEqual(copy);
  });
});

describe('pickChoiceOrder + toWireQuestion', () => {
  const question = quiz('q1');

  it('returns null when shuffleAnswers is off, and wire order is authored order', () => {
    expect(pickChoiceOrder(question, { shuffleAnswers: false }, seeded(1))).toBeNull();
    const wire = toWireQuestion(question, 0, null);
    expect(wire.config.type === 'quiz' && wire.config.choices.map((c) => c.id)).toEqual(['q1-a', 'q1-b', 'q1-c', 'q1-d']);
  });
  it('returns a permutation of the choice ids when on', () => {
    const order = pickChoiceOrder(question, { shuffleAnswers: true }, seeded(5));
    expect(order).not.toBeNull();
    expect([...order!].sort()).toEqual(['q1-a', 'q1-b', 'q1-c', 'q1-d']);
  });
  it('the same stored order yields identical wire questions for host, players and reconnects', () => {
    const order = pickChoiceOrder(question, { shuffleAnswers: true }, seeded(9))!;
    const host = toWireQuestion(question, 0, order);
    const player = toWireQuestion(question, 0, order);
    const reconnect = toWireQuestion(question, 0, [...order]);
    expect(player).toEqual(host);
    expect(reconnect).toEqual(host);
    expect(host.config.type === 'quiz' && host.config.choices.map((c) => c.id)).toEqual(order);
    expect(JSON.stringify(host)).not.toContain('isCorrect');
  });
  it('evaluation stays id-based regardless of display order', () => {
    const order = pickChoiceOrder(question, { shuffleAnswers: true }, seeded(11))!;
    const wire = toWireQuestion(question, 0, order);
    const choices = wire.config.type === 'quiz' ? wire.config.choices : [];
    // Whatever slot B landed in, picking it by id is still correct and nothing else is.
    for (const ch of choices) expect(evaluateAnswer(question, ch.id)).toBe(ch.id === 'q1-b');
  });
  it('shuffles multi_select and poll, leaves true_false / type_answer alone', () => {
    const multi = q('m', { type: 'multi_select', partialCredit: false, choices: [
      { id: 'x', label: 'X', isCorrect: true }, { id: 'y', label: 'Y', isCorrect: true }, { id: 'z', label: 'Z', isCorrect: false },
    ]});
    const poll = q('p', { type: 'poll', choices: [{ id: 'p1', label: '1' }, { id: 'p2', label: '2' }, { id: 'p3', label: '3' }] });
    expect([...pickChoiceOrder(multi, { shuffleAnswers: true }, seeded(2))!].sort()).toEqual(['x', 'y', 'z']);
    expect([...pickChoiceOrder(poll, { shuffleAnswers: true }, seeded(2))!].sort()).toEqual(['p1', 'p2', 'p3']);
    expect(pickChoiceOrder(q('t', { type: 'true_false', correct: true }), { shuffleAnswers: true })).toBeNull();
    expect(pickChoiceOrder(q('ta', { type: 'type_answer', acceptedAnswers: ['a'], caseSensitive: false }), { shuffleAnswers: true })).toBeNull();
  });
  it('always shuffles puzzle pieces and applies the stored order', () => {
    const puzzle = q('pz', { type: 'puzzle', items: [
      { id: 'i1', label: '1' }, { id: 'i2', label: '2' }, { id: 'i3', label: '3' }, { id: 'i4', label: '4' },
    ], correctOrder: ['i1', 'i2', 'i3', 'i4'] });
    const order = pickChoiceOrder(puzzle, { shuffleAnswers: false }, seeded(4));
    expect(order).not.toBeNull();
    expect([...order!].sort()).toEqual(['i1', 'i2', 'i3', 'i4']);
    const wire = toWireQuestion(puzzle, 0, order);
    expect(wire.config.type === 'puzzle' && wire.config.items.map((i) => i.id)).toEqual(order);
  });
  it('tolerates a stale order (ids missing or extra) without dropping choices', () => {
    const wire = toWireQuestion(question, 0, ['q1-d', 'nope', 'q1-a']);
    expect(wire.config.type === 'quiz' && wire.config.choices.map((c) => c.id)).toEqual(['q1-d', 'q1-a', 'q1-b', 'q1-c']);
  });
});

describe('assignNickname', () => {
  it('returns a generated nickname when nothing is taken', () => {
    const name = assignNickname(() => false, seeded(1));
    expect(isGeneratedNickname(name)).toBe(true);
    expect(name.length).toBeLessThanOrEqual(20);
  });
  it('retries past collisions', () => {
    const taken = new Set<string>();
    const first = assignNickname(() => false, seeded(42));
    taken.add(first);
    const second = assignNickname((n) => taken.has(n), seeded(42));
    expect(second).not.toBe(first);
    expect(isGeneratedNickname(second)).toBe(true);
  });
  it('falls back to a numeric suffix after NICKNAME_ATTEMPTS collisions', () => {
    let calls = 0;
    const name = assignNickname((n) => { calls++; return isGeneratedNickname(n); }, seeded(3));
    expect(calls).toBe(NICKNAME_ATTEMPTS + 1);
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ 2$/);
    expect(name.length).toBeLessThanOrEqual(20);
  });
  it('increments the suffix until it is free', () => {
    const name = assignNickname((n) => isGeneratedNickname(n) || n.endsWith(' 2') || n.endsWith(' 3'), seeded(3));
    expect(name).toMatch(/ 4$/);
  });
  it('produces unique names for a full room', () => {
    const taken = new Set<string>();
    const rand = seeded(99);
    for (let i = 0; i < 200; i++) {
      const name = assignNickname((n) => taken.has(n), rand);
      expect(taken.has(name)).toBe(false);
      expect(name.length).toBeLessThanOrEqual(20);
      taken.add(name);
    }
    expect(taken.size).toBe(200);
  });
});

describe('auto-advance', () => {
  const on = { autoAdvance: true };
  const off = { autoAdvance: false };
  const now = 1_000_000;

  it('autoAdvanceAfterReveal schedules the reveal stage only when the option is on', () => {
    expect(autoAdvanceAfterReveal(off, now)).toBeNull();
    expect(autoAdvanceAfterReveal(on, now)).toEqual({ stage: 'reveal', at: now + AUTO_ADVANCE_REVEAL_MS });
    expect(autoAdvanceAfterReveal(DEFAULT_ROOM_SETTINGS, now)).toBeNull();
  });

  it('reveal -> scoreboard when the reveal stage has elapsed', () => {
    const stage = autoAdvanceAfterReveal(on, now)!;
    const t = stage.at;
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 0, total: 3, now: t }))
      .toEqual({ kind: 'scoreboard', at: t + AUTO_ADVANCE_SCOREBOARD_MS });
  });
  it('scoreboard -> next question while questions remain', () => {
    const stage = { stage: 'scoreboard' as const, at: now };
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 0, total: 3, now }))
      .toEqual({ kind: 'next' });
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 1, total: 3, now }))
      .toEqual({ kind: 'next' });
  });
  it('scoreboard -> finish after the last question', () => {
    const stage = { stage: 'scoreboard' as const, at: now };
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 2, total: 3, now }))
      .toEqual({ kind: 'finish' });
  });
  it('does nothing before the stage deadline (alarm fired early or was re-armed)', () => {
    const stage = { stage: 'reveal' as const, at: now + 100 };
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 0, total: 3, now }))
      .toEqual({ kind: 'none' });
  });
  it('never moves a host-driven room, or any phase but reveal', () => {
    const stage = { stage: 'scoreboard' as const, at: now };
    expect(autoAdvanceStep({ phase: 'reveal', settings: off, stage, currentIndex: 0, total: 3, now })).toEqual({ kind: 'none' });
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage: null, currentIndex: 0, total: 3, now })).toEqual({ kind: 'none' });
    for (const phase of ['lobby', 'countdown', 'question', 'scoreboard', 'finished'] as const) {
      expect(autoAdvanceStep({ phase, settings: on, stage, currentIndex: 0, total: 3, now })).toEqual({ kind: 'none' });
    }
  });
  it('walks a full two-question game: reveal, scoreboard, next, reveal, scoreboard, finish', () => {
    const total = 2;
    let t = now;
    let stage = autoAdvanceAfterReveal(on, t)!;
    t = stage.at;
    let step = autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 0, total, now: t });
    expect(step.kind).toBe('scoreboard');
    stage = { stage: 'scoreboard', at: (step as { at: number }).at };
    t = stage.at;
    step = autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 0, total, now: t });
    expect(step).toEqual({ kind: 'next' });
    // Question 2 ran and was revealed:
    stage = autoAdvanceAfterReveal(on, t)!;
    t = stage.at;
    step = autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 1, total, now: t });
    expect(step.kind).toBe('scoreboard');
    stage = { stage: 'scoreboard', at: (step as { at: number }).at };
    t = stage.at;
    expect(autoAdvanceStep({ phase: 'reveal', settings: on, stage, currentIndex: 1, total, now: t })).toEqual({ kind: 'finish' });
    expect(t - now).toBe(2 * (AUTO_ADVANCE_REVEAL_MS + AUTO_ADVANCE_SCOREBOARD_MS));
  });
});
