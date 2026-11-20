export interface ScoringStrategy {
  score(input: { isCorrect: boolean; latencyMs: number; timeLimitMs: number; maxPoints: number }): number;
}

export const classicScoring: ScoringStrategy = {
  score({ isCorrect, latencyMs, timeLimitMs, maxPoints }) {
    if (!isCorrect) return 0;
    const ratio = Math.min(1, Math.max(0, latencyMs / timeLimitMs));
    return Math.max(0, Math.floor(maxPoints * (1 - ratio / 2)));
  },
};

export const accuracyScoring: ScoringStrategy = {
  score({ isCorrect, maxPoints }) { return isCorrect ? maxPoints : 0; },
};
