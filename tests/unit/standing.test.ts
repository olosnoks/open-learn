import { describe, it, expect } from 'vitest';
import { rankEntries } from '../../worker/room/machine';
import { choiceGridClass, gapLine, ordinal, rankLine, teamLine } from '../../src/features/player/standing';

describe('rankEntries', () => {
  it('ranks by score and reports the gap to the player directly above', () => {
    const r = rankEntries([
      { id: 'c', name: 'Cara', score: 300 },
      { id: 'a', name: 'Ann', score: 900 },
      { id: 'b', name: 'Ben', score: 500 },
    ]);
    expect(r.get('a')).toEqual({ rank: 1, total: 3, score: 900 });
    expect(r.get('b')).toEqual({ rank: 2, total: 3, score: 500, behind: { name: 'Ann', points: 400 } });
    expect(r.get('c')).toEqual({ rank: 3, total: 3, score: 300, behind: { name: 'Ben', points: 200 } });
  });

  it('gives tied players the same rank and skips the next one', () => {
    const r = rankEntries([
      { id: 'a', name: 'Ann', score: 900 },
      { id: 'b', name: 'Ben', score: 500 },
      { id: 'c', name: 'Cara', score: 500 },
      { id: 'd', name: 'Dan', score: 100 },
    ]);
    expect(r.get('b')?.rank).toBe(2);
    expect(r.get('c')).toEqual({ rank: 2, total: 4, score: 500, behind: { name: 'Ann', points: 400 } });
    // With a tie directly above, the gap is named after the last of the tied group in sort order.
    expect(r.get('d')).toEqual({ rank: 4, total: 4, score: 100, behind: { name: 'Cara', points: 400 } });
  });

  it('treats a shared first place as first with nobody ahead', () => {
    const r = rankEntries([
      { id: 'a', name: 'Ann', score: 0 },
      { id: 'b', name: 'Ben', score: 0 },
    ]);
    expect(r.get('a')).toEqual({ rank: 1, total: 2, score: 0 });
    expect(r.get('b')).toEqual({ rank: 1, total: 2, score: 0 });
  });

  it('handles empty and single-player rooms', () => {
    expect(rankEntries([]).size).toBe(0);
    expect(rankEntries([{ id: 'a', name: 'Ann', score: 10 }]).get('a')).toEqual({ rank: 1, total: 1, score: 10 });
  });
});

describe('player standing text', () => {
  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th']
    );
  });

  it('builds rank and gap lines', () => {
    expect(rankLine({ rank: 3, totalPlayers: 12 })).toBe("You're 3rd of 12");
    expect(rankLine({ rank: 3, totalPlayers: 12 }, true)).toBe('You finished 3rd of 12');
    expect(rankLine({ rank: 1, totalPlayers: 1 })).toBe("You're 1st");
    expect(gapLine({ totalPlayers: 5, behind: { nickname: 'Ann', points: 120 } })).toBe('120 pts behind Ann');
    expect(gapLine({ totalPlayers: 5, behind: { nickname: 'Ann', points: 1 } })).toBe('1 pt behind Ann');
    expect(gapLine({ totalPlayers: 5 })).toMatch(/Nobody is ahead/);
    expect(gapLine({ totalPlayers: 1 })).toBeNull();
  });

  it('builds the team line', () => {
    const team = { id: 'red', name: 'Red', color: '#D9294A', rank: 2, totalTeams: 4, score: 100 };
    expect(teamLine(team)).toBe('Team Red is 2nd of 4');
    expect(teamLine({ ...team, behind: { name: 'Blue', points: 300 } })).toBe('Team Red is 2nd of 4 · 300 pts behind Blue');
  });

  it('uses a 2x2 grid only for 3-4 choices', () => {
    expect(choiceGridClass(2)).not.toContain('grid-cols-2');
    expect(choiceGridClass(3)).toContain('min-[360px]:grid-cols-2');
    expect(choiceGridClass(4)).toContain('min-[360px]:grid-cols-2');
    expect(choiceGridClass(5)).not.toContain('grid-cols-2');
  });
});
