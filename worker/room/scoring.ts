export type ScoreInput = {
  isCorrect: boolean;
  latencyMs: number;
  timeLimitMs: number;
  maxPoints: number;
  /** Consecutive correct answers the player had BEFORE this one (players.streak at answer time). */
  streak?: number;
};

export interface ScoringStrategy {
  score(input: ScoreInput): number;
}

/** Streak bonus: +STREAK_BONUS_STEP per consecutive correct answer already on the streak, capped. */
export const STREAK_BONUS_STEP = 100;
export const STREAK_BONUS_CAP = 5;

/**
 * Kahoot-style answer streak bonus (classic mode only).
 *
 *   bonus = STREAK_BONUS_STEP * min(streak, STREAK_BONUS_CAP)
 *
 * where `streak` is the run of consecutive correct answers before this one, so the first correct
 * answer earns no bonus, the second in a row +100, the third +200, ... and the sixth onwards +500.
 * A wrong answer resets the streak (done by the room when it updates players.streak).
 * Questions worth 0 points never award a bonus either, so a "no points" question stays worth nothing.
 */
export function streakBonus(streak: number, maxPoints: number): number {
  if (maxPoints <= 0 || !Number.isFinite(streak) || streak <= 0) return 0;
  return STREAK_BONUS_STEP * Math.min(Math.floor(streak), STREAK_BONUS_CAP);
}

/**
 * Classic: speed-weighted points plus the streak bonus.
 *
 *   speed  = floor(maxPoints * (1 - latency / timeLimit / 2))   (full points instantly, half at the buzzer)
 *   total  = speed + streakBonus(streak, maxPoints)
 */
export const classicScoring: ScoringStrategy = {
  score({ isCorrect, latencyMs, timeLimitMs, maxPoints, streak = 0 }) {
    if (!isCorrect) return 0;
    const ratio = Math.min(1, Math.max(0, latencyMs / timeLimitMs));
    const speed = Math.max(0, Math.floor(maxPoints * (1 - ratio / 2)));
    return speed + streakBonus(streak, maxPoints);
  },
};

/** Accuracy: full points for a correct answer, nothing for speed or streaks. */
export const accuracyScoring: ScoringStrategy = {
  score({ isCorrect, maxPoints }) { return isCorrect ? maxPoints : 0; },
};
