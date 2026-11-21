import { describe, it, expect } from 'vitest';
import {
  classicScoring, accuracyScoring, streakBonus, STREAK_BONUS_STEP, STREAK_BONUS_CAP,
} from '../../worker/room/scoring';

describe('classicScoring', () => {
  const maxPoints = 1000;
  const timeLimitMs = 20000;
  it('awards 0 for incorrect', () => {
    expect(classicScoring.score({ isCorrect: false, latencyMs: 1000, timeLimitMs, maxPoints })).toBe(0);
  });
  it('awards 0 for incorrect even on a long streak', () => {
    expect(classicScoring.score({ isCorrect: false, latencyMs: 0, timeLimitMs, maxPoints, streak: 9 })).toBe(0);
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

  describe('streak bonus', () => {
    it('first correct answer (streak 0) gets no bonus', () => {
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints, streak: 0 })).toBe(1000);
    });
    it('adds +100 per prior consecutive correct answer', () => {
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints, streak: 1 })).toBe(1100);
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints, streak: 2 })).toBe(1200);
      expect(classicScoring.score({ isCorrect: true, latencyMs: 10000, timeLimitMs, maxPoints, streak: 3 })).toBe(1050);
    });
    it('caps the bonus at STREAK_BONUS_CAP steps', () => {
      const cap = STREAK_BONUS_STEP * STREAK_BONUS_CAP;
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints, streak: STREAK_BONUS_CAP })).toBe(1000 + cap);
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints, streak: 50 })).toBe(1000 + cap);
    });
    it('does not turn a 0-point question into points', () => {
      expect(classicScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs, maxPoints: 0, streak: 4 })).toBe(0);
      expect(streakBonus(4, 0)).toBe(0);
    });
    it('streakBonus ignores negative or non-finite input', () => {
      expect(streakBonus(-1, 1000)).toBe(0);
      expect(streakBonus(Number.NaN, 1000)).toBe(0);
    });
  });
});

describe('accuracyScoring', () => {
  it('awards max for correct regardless of speed', () => {
    expect(accuracyScoring.score({ isCorrect: true, latencyMs: 19000, timeLimitMs: 20000, maxPoints: 500 })).toBe(500);
  });
  it('ignores streaks', () => {
    expect(accuracyScoring.score({ isCorrect: true, latencyMs: 0, timeLimitMs: 20000, maxPoints: 500, streak: 5 })).toBe(500);
  });
});
