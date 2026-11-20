import { describe, it, expect } from 'vitest';

function computeTeamScore(members: { score: number }[], strategy: 'sum' | 'average' = 'sum') {
  if (members.length === 0) return 0;
  const sum = members.reduce((s, m) => s + m.score, 0);
  return strategy === 'average' ? Math.round(sum / members.length) : sum;
}

describe('computeTeamScore', () => {
  it('sums member scores', () => {
    expect(computeTeamScore([{ score: 500 }, { score: 300 }])).toBe(800);
  });
  it('averages when requested', () => {
    expect(computeTeamScore([{ score: 500 }, { score: 300 }], 'average')).toBe(400);
  });
  it('returns 0 for empty teams', () => {
    expect(computeTeamScore([])).toBe(0);
  });
});
