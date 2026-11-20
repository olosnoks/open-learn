import type { PersonalStanding } from '../../shared/types';

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** e.g. "You're 1st of 12" / "You're 3rd of 12" (or "You finished …" when final). */
export function rankLine(s: Pick<PersonalStanding, 'rank' | 'totalPlayers'>, final = false): string {
  const lead = final ? 'You finished' : "You're";
  if (s.totalPlayers <= 1) return `${lead} ${ordinal(s.rank)}`;
  return `${lead} ${ordinal(s.rank)} of ${s.totalPlayers}`;
}

/** e.g. "120 pts behind Alice", or a 1st-place message. */
export function gapLine(s: Pick<PersonalStanding, 'behind' | 'totalPlayers'>, final = false): string | null {
  if (s.behind) return `${pts(s.behind.points)} behind ${s.behind.nickname}`;
  if (s.totalPlayers <= 1) return null;
  return final ? 'Top of the leaderboard!' : 'Nobody is ahead of you. Keep it up!';
}

/** e.g. "Team Red is 2nd of 4 · 300 pts behind Blue". */
export function teamLine(team: NonNullable<PersonalStanding['team']>): string {
  const base = `Team ${team.name} is ${ordinal(team.rank)} of ${team.totalTeams}`;
  return team.behind ? `${base} · ${pts(team.behind.points)} behind ${team.behind.name}` : base;
}

/** 2x2 on screens at least 360px wide when there are 3–4 choices; one column otherwise. */
export function choiceGridClass(count: number): string {
  return count >= 3 && count <= 4 ? 'grid gap-3 min-[360px]:grid-cols-2' : 'grid gap-3';
}
