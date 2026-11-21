/**
 * Pure report math for a finished game. No React, no fetch: everything here is derived
 * from the rows the Worker already stores (game_sessions.summary_json, session_answers,
 * and the quiz's questions), so the report needs no extra tables.
 *
 * Definitions (Kahoot-style):
 * - A question is "scored" unless its type is poll / slide / scale (never award points).
 * - A question was "asked" when at least one answer row exists for it. Questions with no
 *   answers at all (the host ended early, or a slide) are shown but excluded from every
 *   denominator so an early-ended game does not read as 0 % accuracy.
 * - A player who did not answer an asked question counts as incorrect for that question.
 * - Accuracy = correct / (players x asked scored questions) overall; per player it is
 *   correct / asked scored questions; per question it is correct / players.
 * - Longest streak = most consecutive correct answers over the asked scored questions in
 *   quiz order. A wrong answer or a missing answer breaks the streak.
 */
import type { QuestionConfig } from '../../shared/schemas';
import type { PlayerRow, Standings, TeamWithMembers } from '../../shared/types';

export const DIFFICULT_THRESHOLD = 0.35;
export const NEEDS_HELP_THRESHOLD = 0.35;

const UNSCORED_TYPES: ReadonlySet<QuestionConfig['type']> = new Set(['poll', 'slide', 'scale']);
export const isScoredType = (type: string) => !UNSCORED_TYPES.has(type as QuestionConfig['type']);

/** One row of session_answers as the Worker returns it. */
export type ReportAnswer = {
  playerId: string;
  playerNickname: string;
  questionId: string;
  questionPrompt: string;
  /** JSON-encoded answer (JSON.stringify of what the player sent). */
  payload: string;
  latencyMs: number;
  isCorrect: number | boolean;
  points: number;
};

/** One quiz question as the Worker returns it, config already parsed. May be absent if deleted. */
export type ReportQuestion = {
  id: string;
  order: number;
  type: string;
  prompt: string;
  points: number;
  config: QuestionConfig | null;
};

/** game_sessions.summary_json as RoomDO writes it on finish. */
export type SessionSummary = {
  isTeam: boolean;
  players: PlayerRow[];
  teams: TeamWithMembers[];
  podium: Standings;
};

export type ReportSession = {
  id: string;
  quizId: string;
  quizTitle: string | null;
  roomCode: string;
  mode: string;
  startedAt: number | null;
  endedAt: number | null;
  summaryJson: string | null;
};

export type ReportInput = {
  session: ReportSession;
  questions: ReportQuestion[];
  answers: ReportAnswer[];
};

export type DistributionBucket = {
  key: string;
  label: string;
  count: number;
  /** true/false for scored questions, null for polls and the "No answer" bucket. */
  isCorrect: boolean | null;
};

export type QuestionStat = {
  id: string;
  /** 1-based position in the quiz. Orphans (deleted questions) go last. */
  position: number;
  type: string;
  prompt: string;
  scored: boolean;
  asked: boolean;
  answered: number;
  correct: number;
  /** correct / players, or null when unscored or never asked. */
  accuracy: number | null;
  difficult: boolean;
  avgLatencyMs: number | null;
  distribution: DistributionBucket[];
};

export type PlayerAnswerDetail = {
  questionId: string;
  position: number;
  prompt: string;
  scored: boolean;
  answered: boolean;
  answerLabel: string;
  isCorrect: boolean | null;
  points: number;
  latencyMs: number | null;
};

export type PlayerStat = {
  id: string;
  nickname: string;
  teamId: string | null;
  rank: number;
  score: number;
  correct: number;
  /** Number of asked scored questions (same for every player). */
  total: number;
  accuracy: number | null;
  longestStreak: number;
  needsHelp: boolean;
  answers: PlayerAnswerDetail[];
};

export type TeamStat = {
  id: string;
  name: string;
  color: string;
  rank: number;
  score: number;
  memberCount: number;
  correct: number;
  total: number;
  accuracy: number | null;
  members: string[];
};

export type Report = {
  status: 'live' | 'finished' | 'empty';
  summary: {
    players: number;
    questions: number;
    askedScored: number;
    accuracy: number | null;
    avgScore: number | null;
    durationMs: number | null;
  };
  questions: QuestionStat[];
  players: PlayerStat[];
  teams: TeamStat[] | null;
};

export function parseSummary(json: string | null | undefined): SessionSummary | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as Partial<SessionSummary>;
    if (!s || !Array.isArray(s.players)) return null;
    return {
      isTeam: Boolean(s.isTeam),
      players: s.players,
      teams: Array.isArray(s.teams) ? s.teams : [],
      podium: s.podium ?? { kind: 'players', rows: [] },
    };
  } catch {
    return null;
  }
}

/** correct / attempts, or null when there were no attempts. */
export function accuracyRatio(correct: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return Math.max(0, Math.min(1, correct / attempts));
}

/** Overall accuracy from aggregate counts, as the history list shows it. */
export function overallAccuracy(correct: number, players: number, askedScoredQuestions: number): number | null {
  return accuracyRatio(correct, players * askedScoredQuestions);
}

export const isDifficult = (accuracy: number | null) => accuracy !== null && accuracy < DIFFICULT_THRESHOLD;
export const needsHelp = (accuracy: number | null) => accuracy !== null && accuracy < NEEDS_HELP_THRESHOLD;

/**
 * Longest run of `true` in `results`. `undefined` means "did not answer" and breaks the
 * run, like a wrong answer.
 */
export function longestStreak(results: (boolean | undefined)[]): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r === true ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Competition ranking (1, 2, 2, 4) over a score-sorted list. */
export function rankByScore<T extends { score: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.score !== sorted[i - 1].score) rank = i + 1;
    return { ...r, rank };
  });
}

export function parsePayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

/** Human-readable version of a stored answer for a given question. */
export function answerLabel(question: ReportQuestion | undefined, payload: string): string {
  const value = parsePayload(payload);
  const c = question?.config ?? null;
  if (value === null || value === undefined) return '—';
  if (c) {
    switch (c.type) {
      case 'quiz':
      case 'poll':
      case 'multi_select': {
        const ids = Array.isArray(value) ? value : [value];
        const labels = ids.map((id) => c.choices.find((ch) => ch.id === id)?.label ?? String(id));
        return labels.join(', ');
      }
      case 'true_false':
        return value === true ? 'True' : value === false ? 'False' : String(value);
      case 'puzzle': {
        if (!Array.isArray(value)) return String(value);
        return value.map((id) => c.items.find((it) => it.id === id)?.label ?? String(id)).join(' → ');
      }
      case 'drop_pin': {
        const v = value as { x?: unknown; y?: unknown };
        if (typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') {
          return `(${Math.round(v.x * 100)} %, ${Math.round(v.y * 100)} %)`;
        }
        return String(value);
      }
      default:
        break;
    }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Correct option ids for choice-style questions, used to colour the distribution. */
function correctChoiceIds(c: QuestionConfig | null): Set<string> | null {
  if (!c) return null;
  if (c.type === 'quiz' || c.type === 'multi_select') {
    return new Set(c.choices.filter((ch) => ch.isCorrect).map((ch) => ch.id));
  }
  return null;
}

/**
 * Answer distribution for one question. Choice-style questions get one bucket per option
 * (zero counts included, in option order); other types bucket by the answer value, most
 * popular first. A trailing "No answer" bucket covers players who did not respond.
 */
export function distribution(
  question: ReportQuestion | undefined,
  answers: ReportAnswer[],
  playerCount: number,
): DistributionBucket[] {
  const c = question?.config ?? null;
  const scored = question ? isScoredType(question.type) : true;
  const buckets: DistributionBucket[] = [];
  const byKey = new Map<string, DistributionBucket>();
  const add = (key: string, label: string, isCorrect: boolean | null) => {
    const b: DistributionBucket = { key, label, count: 0, isCorrect };
    byKey.set(key, b);
    buckets.push(b);
    return b;
  };

  if (c && (c.type === 'quiz' || c.type === 'multi_select' || c.type === 'poll')) {
    const correct = correctChoiceIds(c);
    for (const ch of c.choices) add(ch.id, ch.label, correct ? correct.has(ch.id) : null);
    for (const a of answers) {
      const v = parsePayload(a.payload);
      const ids = Array.isArray(v) ? (v as unknown[]) : [v];
      for (const id of ids) {
        const key = String(id);
        (byKey.get(key) ?? add(key, key, false)).count += 1;
      }
    }
  } else if (c && c.type === 'true_false') {
    add('true', 'True', c.correct === true);
    add('false', 'False', c.correct === false);
    for (const a of answers) {
      const key = String(parsePayload(a.payload));
      (byKey.get(key) ?? add(key, key, false)).count += 1;
    }
  } else {
    // Free-form types: bucket by the displayed label; correctness comes from the stored flag.
    const fixed: DistributionBucket[] = [];
    for (const a of answers) {
      const label = answerLabel(question, a.payload);
      const key = `${a.isCorrect ? 1 : 0}:${label}`;
      let b = byKey.get(key);
      if (!b) {
        b = { key, label, count: 0, isCorrect: scored ? Boolean(a.isCorrect) : null };
        byKey.set(key, b);
        fixed.push(b);
      }
      b.count += 1;
    }
    fixed.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
    buckets.push(...fixed);
  }

  const missing = Math.max(0, playerCount - answers.length);
  if (missing > 0) buckets.push({ key: '__none__', label: 'No answer', count: missing, isCorrect: null });
  return buckets;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Build the whole report from the three sets of rows. Safe on a live or empty session. */
export function buildReport(input: ReportInput): Report {
  const { session, answers } = input;
  const summary = parseSummary(session.summaryJson);

  // --- Question list: quiz order first, then any ids only seen in answers (deleted questions).
  const byId = new Map<string, ReportQuestion>();
  for (const q of [...input.questions].sort((a, b) => a.order - b.order)) byId.set(q.id, q);
  const answersByQ = new Map<string, ReportAnswer[]>();
  for (const a of answers) {
    const list = answersByQ.get(a.questionId);
    if (list) list.push(a);
    else answersByQ.set(a.questionId, [a]);
  }
  const ordered: ReportQuestion[] = [...byId.values()];
  let nextOrder = ordered.length ? ordered[ordered.length - 1].order + 1 : 0;
  for (const [qid, list] of answersByQ) {
    if (byId.has(qid)) continue;
    const orphan: ReportQuestion = {
      id: qid, order: nextOrder++, type: 'quiz', prompt: list[0].questionPrompt, points: 0, config: null,
    };
    byId.set(qid, orphan);
    ordered.push(orphan);
  }

  // --- Players: the summary is authoritative (includes those who never answered).
  const playerMap = new Map<string, { id: string; nickname: string; score: number; teamId: string | null; streak: number }>();
  for (const p of summary?.players ?? []) {
    playerMap.set(p.id, { id: p.id, nickname: p.nickname, score: p.score, teamId: p.teamId ?? null, streak: p.streak ?? 0 });
  }
  const scoreFromAnswers = new Map<string, number>();
  for (const a of answers) {
    scoreFromAnswers.set(a.playerId, (scoreFromAnswers.get(a.playerId) ?? 0) + a.points);
    if (!playerMap.has(a.playerId)) {
      playerMap.set(a.playerId, { id: a.playerId, nickname: a.playerNickname, score: 0, teamId: null, streak: 0 });
    }
  }
  if (!summary) {
    for (const p of playerMap.values()) p.score = scoreFromAnswers.get(p.id) ?? 0;
  }
  const playerCount = playerMap.size;

  // --- Per-question stats.
  const questionStats: QuestionStat[] = ordered.map((q, i) => {
    const list = answersByQ.get(q.id) ?? [];
    const scored = isScoredType(q.type);
    const asked = list.length > 0;
    const correct = list.filter((a) => Boolean(a.isCorrect)).length;
    const accuracy = scored && asked ? accuracyRatio(correct, playerCount) : null;
    return {
      id: q.id,
      position: i + 1,
      type: q.type,
      prompt: q.prompt,
      scored,
      asked,
      answered: list.length,
      correct,
      accuracy,
      difficult: isDifficult(accuracy),
      avgLatencyMs: asked ? avg(list.map((a) => a.latencyMs)) : null,
      distribution: distribution(q, list, asked ? playerCount : 0),
    };
  });

  const askedScored = questionStats.filter((q) => q.scored && q.asked);
  const askedScoredIds = new Set(askedScored.map((q) => q.id));

  // --- Per-player stats.
  const answerByPlayerQ = new Map<string, ReportAnswer>();
  for (const a of answers) answerByPlayerQ.set(`${a.playerId}\u0000${a.questionId}`, a);

  const playerRows = [...playerMap.values()].map((p) => {
    const details: PlayerAnswerDetail[] = questionStats
      .filter((q) => q.asked)
      .map((q) => {
        const a = answerByPlayerQ.get(`${p.id}\u0000${q.id}`);
        return {
          questionId: q.id,
          position: q.position,
          prompt: q.prompt,
          scored: q.scored,
          answered: Boolean(a),
          answerLabel: a ? answerLabel(byId.get(q.id), a.payload) : 'No answer',
          isCorrect: q.scored ? (a ? Boolean(a.isCorrect) : false) : null,
          points: a?.points ?? 0,
          latencyMs: a?.latencyMs ?? null,
        };
      });
    const scoredDetails = details.filter((d) => askedScoredIds.has(d.questionId));
    const correct = scoredDetails.filter((d) => d.isCorrect === true).length;
    const total = askedScored.length;
    const accuracy = accuracyRatio(correct, total);
    return {
      id: p.id,
      nickname: p.nickname,
      teamId: p.teamId,
      score: p.score,
      correct,
      total,
      accuracy,
      longestStreak: longestStreak(scoredDetails.map((d) => (d.answered ? d.isCorrect === true : undefined))),
      needsHelp: needsHelp(accuracy),
      answers: details,
    };
  });
  const players: PlayerStat[] = rankByScore(playerRows);

  // --- Teams (only for team games).
  let teams: TeamStat[] | null = null;
  if (summary?.isTeam) {
    const rows = summary.teams.map((t) => {
      const members = players.filter((p) => p.teamId === t.id);
      const correct = members.reduce((s, m) => s + m.correct, 0);
      const total = members.length * askedScored.length;
      return {
        id: t.id,
        name: t.name,
        color: t.color,
        score: members.length ? members.reduce((s, m) => s + m.score, 0) : t.score,
        memberCount: members.length,
        correct,
        total,
        accuracy: accuracyRatio(correct, total),
        members: members.map((m) => m.nickname),
      };
    });
    teams = rankByScore(rows);
  }

  const totalCorrect = askedScored.reduce((s, q) => s + q.correct, 0);
  const status: Report['status'] = !session.endedAt ? 'live' : playerCount === 0 ? 'empty' : 'finished';

  return {
    status,
    summary: {
      players: playerCount,
      questions: ordered.length,
      askedScored: askedScored.length,
      accuracy: overallAccuracy(totalCorrect, playerCount, askedScored.length),
      avgScore: avg(players.map((p) => p.score)),
      durationMs: session.startedAt && session.endedAt ? Math.max(0, session.endedAt - session.startedAt) : null,
    },
    questions: questionStats,
    players,
    teams,
  };
}

export function sortQuestions(qs: QuestionStat[], by: 'order' | 'difficulty'): QuestionStat[] {
  if (by === 'order') return [...qs].sort((a, b) => a.position - b.position);
  // Hardest first; unscored / unasked go to the end in quiz order.
  return [...qs].sort((a, b) => {
    const aa = a.accuracy ?? Number.POSITIVE_INFINITY;
    const bb = b.accuracy ?? Number.POSITIVE_INFINITY;
    return aa - bb || a.position - b.position;
  });
}

// --- CSV --------------------------------------------------------------------------

/** CSV cell escaping with the spreadsheet formula-injection guard the Worker export uses. */
export function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function playersCsv(report: Report): string {
  const teamName = new Map((report.teams ?? []).map((t) => [t.id, t.name] as const));
  return toCsv(
    ['rank', 'nickname', 'team', 'score', 'correct', 'total', 'accuracy_pct', 'longest_streak', 'needs_help'],
    report.players.map((p) => [
      p.rank, p.nickname, p.teamId ? teamName.get(p.teamId) ?? p.teamId : '', p.score, p.correct, p.total,
      p.accuracy === null ? '' : Math.round(p.accuracy * 100), p.longestStreak, p.needsHelp ? 'yes' : 'no',
    ]),
  );
}

// --- Formatting helpers shared by the pages ------------------------------------------

export const pct = (ratio: number | null) => (ratio === null ? '—' : `${Math.round(ratio * 100)} %`);

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const modeLabel = (mode: string, isTeam: boolean) => `${mode}${isTeam ? ' · teams' : ''}`;
