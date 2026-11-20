import { describe, it, expect } from 'vitest';
import { classicScoring, accuracyScoring } from '../../worker/room/scoring';

describe('classicScoring', () => {
  const maxPoints = 1000;
  const timeLimitMs = 20000;
  it('awards 0 for incorrect', () => {
    expect(classicScoring.score({ isCorrect: false, latencyMs: 1000, timeLimitMs, maxPoints })).toBe(0);
  });
  it('awards max at zero latency', () => {
    expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints })).toBe(1000);
  });
  it('awards 750 at half time', () => {
    expect(classicScoring.score({ isCorrect: true, latencyMs: 10000, timeLimitMs, maxPoints })).toBe(750);
  });
  it('awards 500 at full time', () => {
    expect(classicScoring.score({ isCorrect: true, latencyMs: 20000, timeLimitMs, maxPoints })).toBe(500);
  });
});

describe('accuracyScoring', () => {
  it('awards max for correct regardless of speed', () => {
    expect(accuracyScoring.score({ isCorrect: true, latencyMs: 19000, timeLimitMs: 20000, maxPoints: 500 })).toBe(500);
  });
});
