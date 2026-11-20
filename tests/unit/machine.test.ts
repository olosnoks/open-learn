import { describe, it, expect } from 'vitest';
import { evaluateAnswer, getCorrectAnswer, toWireQuestion, type StoredQuestion } from '../../worker/room/machine';
import { ClientEventSchema } from '../../src/shared/schemas';

function q(config: StoredQuestion['config']): StoredQuestion {
  return { id: 'q1', order: 0, type: config.type, prompt: 'x', timeLimitSec: 20, points: 1000, config };
}

describe('evaluateAnswer', () => {
  it('quiz correct id', () => {
    const question = q({ type: 'quiz', choices: [
      { id: 'a', label: 'A', isCorrect: false },
      { id: 'b', label: 'B', isCorrect: true },
    ]});
    expect(evaluateAnswer(question, 'b')).toBe(true);
    expect(evaluateAnswer(question, 'a')).toBe(false);
  });
  it('type_answer case-insensitive', () => {
    const question = q({ type: 'type_answer', acceptedAnswers: ['Paris'], caseSensitive: false });
    expect(evaluateAnswer(question, '  paris ')).toBe(true);
    expect(evaluateAnswer(question, 'PARIS')).toBe(true);
    expect(evaluateAnswer(question, 'London')).toBe(false);
  });
  it('puzzle exact order', () => {
    const question = q({ type: 'puzzle', items: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' },
    ], correctOrder: ['a', 'b', 'c'] });
    expect(evaluateAnswer(question, ['a', 'b', 'c'])).toBe(true);
    expect(evaluateAnswer(question, ['a', 'c', 'b'])).toBe(false);
  });
  it('multi_select exact set', () => {
    const question = q({ type: 'multi_select', partialCredit: false, choices: [
      { id: 'a', label: 'A', isCorrect: true },
      { id: 'b', label: 'B', isCorrect: true },
      { id: 'c', label: 'C', isCorrect: false },
    ]});
    expect(evaluateAnswer(question, ['a', 'b'])).toBe(true);
    expect(evaluateAnswer(question, ['a', 'b', 'c'])).toBe(false);
    expect(evaluateAnswer(question, ['a'])).toBe(false);
  });
  it('slider tolerance', () => {
    const question = q({ type: 'slider', min: 0, max: 100, step: 1, correct: 50, tolerance: 5 });
    expect(evaluateAnswer(question, 53)).toBe(true);
    expect(evaluateAnswer(question, 56)).toBe(false);
  });
  it('drop_pin rejects malformed payloads', () => {
    const question = q({ type: 'drop_pin', imageUrl: 'https://example.com/a.png', correctX: 0.5, correctY: 0.5, tolerance: 0.1 });
    expect(evaluateAnswer(question, { x: 0.52, y: 0.49 })).toBe(true);
    expect(evaluateAnswer(question, { x: '0.5', y: 0.5 })).toBe(false);
    expect(evaluateAnswer(question, null)).toBe(false);
  });
  it('poll never awards', () => {
    const question = q({ type: 'poll', choices: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
    ]});
    expect(evaluateAnswer(question, 'a')).toBe(false);
  });
});

describe('toWireQuestion', () => {
  it('never leaks correctness to players', () => {
    const question = q({ type: 'quiz', choices: [
      { id: 'a', label: 'A', isCorrect: false },
      { id: 'b', label: 'B', isCorrect: true },
    ]});
    expect(JSON.stringify(toWireQuestion(question, 0))).not.toContain('isCorrect');
    expect(getCorrectAnswer(question)).toEqual({ type: 'choice', ids: ['b'] });
  });
});

describe('ClientEventSchema', () => {
  it('accepts well-formed messages', () => {
    expect(ClientEventSchema.safeParse({ type: 'JOIN', nickname: 'Ada' }).success).toBe(true);
    expect(ClientEventSchema.safeParse({ type: 'ANSWER', questionId: 'q1', answer: ['a'] }).success).toBe(true);
  });
  it('rejects malformed messages', () => {
    expect(ClientEventSchema.safeParse({ type: 'JOIN', nickname: '' }).success).toBe(false);
    expect(ClientEventSchema.safeParse({ type: 'JOIN', nickname: 'x'.repeat(21) }).success).toBe(false);
    expect(ClientEventSchema.safeParse({ type: 'HOST_START' }).success).toBe(false);
    expect(ClientEventSchema.safeParse({ type: 'NOPE' }).success).toBe(false);
  });
});
