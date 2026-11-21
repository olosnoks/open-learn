import { describe, expect, it } from 'vitest';
import {
  accuracyRatio, answerLabel, buildReport, csvEscape, distribution, formatDuration, isDifficult,
  longestStreak, needsHelp, overallAccuracy, parseSummary, playersCsv, rankByScore, sortQuestions,
  type ReportAnswer, type ReportInput, type ReportQuestion,
} from '../../src/features/results/report';

const quizQ = (id: string, order: number, correctId = 'b'): ReportQuestion => ({
  id, order, type: 'quiz', prompt: `Q${order + 1}`, points: 1000,
  config: { type: 'quiz', choices: [
    { id: 'a', label: 'Alpha', isCorrect: correctId === 'a' },
    { id: 'b', label: 'Beta', isCorrect: correctId === 'b' },
    { id: 'c', label: 'Gamma', isCorrect: correctId === 'c' },
  ] },
});

const pollQ = (id: string, order: number): ReportQuestion => ({
  id, order, type: 'poll', prompt: 'Poll', points: 0,
  config: { type: 'poll', choices: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] },
});

const ans = (
  playerId: string, questionId: string, payload: unknown, isCorrect: boolean, points = isCorrect ? 800 : 0,
  latencyMs = 1000,
): ReportAnswer => ({
  playerId, playerNickname: playerId.toUpperCase(), questionId, questionPrompt: 'p',
  payload: JSON.stringify(payload), latencyMs, isCorrect: isCorrect ? 1 : 0, points,
});

const player = (id: string, score: number, teamId: string | null = null) => ({
  id, nickname: id.toUpperCase(), score, streak: 0, connected: true, teamId,
});

function input(overrides: Partial<ReportInput> = {}, summary: object | null = {
  isTeam: false,
  players: [player('ann', 2400), player('bob', 800), player('cat', 0)],
  teams: [],
  podium: { kind: 'players', rows: [] },
}): ReportInput {
  return {
    session: {
      id: 's1', quizId: 'quiz1', quizTitle: 'Capitals', roomCode: 'ABC123', mode: 'classic',
      startedAt: 1_000_000, endedAt: 1_000_000 + 125_000,
      summaryJson: summary ? JSON.stringify(summary) : null,
    },
    questions: [quizQ('q1', 0), quizQ('q2', 1), quizQ('q3', 2), pollQ('q4', 3)],
    answers: [
      ans('ann', 'q1', 'b', true), ans('bob', 'q1', 'a', false), ans('cat', 'q1', 'c', false),
      ans('ann', 'q2', 'b', true), ans('bob', 'q2', 'b', true),              // cat: no answer
      ans('ann', 'q3', 'b', true), ans('bob', 'q3', 'a', false), ans('cat', 'q3', 'a', false),
      ans('ann', 'q4', 'x', false, 0), ans('bob', 'q4', 'y', false, 0),
    ],
    ...overrides,
  };
}

describe('accuracy helpers', () => {
  it('accuracyRatio clamps and handles zero attempts', () => {
    expect(accuracyRatio(3, 4)).toBe(0.75);
    expect(accuracyRatio(0, 0)).toBeNull();
    expect(accuracyRatio(5, 4)).toBe(1);
  });
  it('overallAccuracy uses players x asked scored questions', () => {
    expect(overallAccuracy(6, 3, 4)).toBe(0.5);
    expect(overallAccuracy(0, 0, 4)).toBeNull();
    expect(overallAccuracy(0, 3, 0)).toBeNull();
  });
  it('difficult / needs-help thresholds are strict at 35 %', () => {
    expect(isDifficult(0.34)).toBe(true);
    expect(isDifficult(0.35)).toBe(false);
    expect(isDifficult(null)).toBe(false);
    expect(needsHelp(0.2)).toBe(true);
    expect(needsHelp(0.9)).toBe(false);
    expect(needsHelp(null)).toBe(false);
  });
});

describe('longestStreak', () => {
  it('counts consecutive correct answers; wrong or missing answers break the run', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([true, true, false, true])).toBe(2);
    expect(longestStreak([true, undefined, true, true, true])).toBe(3);
    expect(longestStreak([false, false])).toBe(0);
  });
});

describe('rankByScore', () => {
  it('gives tied scores the same rank and skips the next (1, 2, 2, 4)', () => {
    const ranked = rankByScore([{ score: 5 }, { score: 9 }, { score: 5 }, { score: 1 }]);
    expect(ranked.map((r) => [r.score, r.rank])).toEqual([[9, 1], [5, 2], [5, 2], [1, 4]]);
  });
});

describe('parseSummary', () => {
  it('returns null for missing or malformed JSON', () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary('{not json')).toBeNull();
    expect(parseSummary('{"players": "nope"}')).toBeNull();
  });
  it('fills defaults', () => {
    const s = parseSummary('{"players": []}');
    expect(s).toEqual({ isTeam: false, players: [], teams: [], podium: { kind: 'players', rows: [] } });
  });
});

describe('answerLabel', () => {
  it('maps choice ids to labels', () => {
    expect(answerLabel(quizQ('q', 0), '"a"')).toBe('Alpha');
    expect(answerLabel(quizQ('q', 0), '["a","c"]')).toBe('Alpha, Gamma');
    expect(answerLabel(quizQ('q', 0), '"zzz"')).toBe('zzz');
  });
  it('handles true/false, puzzle, pin, text, null and deleted questions', () => {
    const tf: ReportQuestion = { id: 't', order: 0, type: 'true_false', prompt: '', points: 0, config: { type: 'true_false', correct: true } };
    expect(answerLabel(tf, 'true')).toBe('True');
    expect(answerLabel(tf, 'false')).toBe('False');
    const puzzle: ReportQuestion = { id: 'p', order: 0, type: 'puzzle', prompt: '', points: 0, config: {
      type: 'puzzle', items: [{ id: '1', label: 'One' }, { id: '2', label: 'Two' }, { id: '3', label: 'Three' }], correctOrder: ['1', '2', '3'],
    } };
    expect(answerLabel(puzzle, '["2","1","3"]')).toBe('Two → One → Three');
    const pin: ReportQuestion = { id: 'd', order: 0, type: 'drop_pin', prompt: '', points: 0, config: {
      type: 'drop_pin', imageUrl: 'https://x/y.png', correctX: 0.5, correctY: 0.5, tolerance: 0.1,
    } };
    expect(answerLabel(pin, '{"x":0.25,"y":0.5}')).toBe('(25 %, 50 %)');
    expect(answerLabel(undefined, '"Paris"')).toBe('Paris');
    expect(answerLabel(undefined, 'null')).toBe('—');
    expect(answerLabel(undefined, 'not json')).toBe('not json');
  });
});

describe('distribution', () => {
  it('lists every option in order with zero counts and marks the correct one', () => {
    const d = distribution(quizQ('q1', 0), [ans('a', 'q1', 'b', true), ans('b', 'q1', 'b', true), ans('c', 'q1', 'a', false)], 4);
    expect(d).toEqual([
      { key: 'a', label: 'Alpha', count: 1, isCorrect: false },
      { key: 'b', label: 'Beta', count: 2, isCorrect: true },
      { key: 'c', label: 'Gamma', count: 0, isCorrect: false },
      { key: '__none__', label: 'No answer', count: 1, isCorrect: null },
    ]);
  });
  it('polls have no correctness', () => {
    const d = distribution(pollQ('q4', 0), [ans('a', 'q4', 'x', false, 0)], 1);
    expect(d.map((b) => b.isCorrect)).toEqual([null, null]);
  });
  it('true/false buckets', () => {
    const tf: ReportQuestion = { id: 't', order: 0, type: 'true_false', prompt: '', points: 0, config: { type: 'true_false', correct: false } };
    const d = distribution(tf, [ans('a', 't', true, false), ans('b', 't', false, true)], 2);
    expect(d).toEqual([
      { key: 'true', label: 'True', count: 1, isCorrect: false },
      { key: 'false', label: 'False', count: 1, isCorrect: true },
    ]);
  });
  it('free-text answers bucket by label, most popular first', () => {
    const q: ReportQuestion = { id: 't', order: 0, type: 'type_answer', prompt: '', points: 0, config: { type: 'type_answer', acceptedAnswers: ['Paris'], caseSensitive: false } };
    const d = distribution(q, [ans('a', 't', 'Paris', true), ans('b', 't', 'Paris', true), ans('c', 't', 'Lyon', false)], 3);
    expect(d).toEqual([
      { key: '1:Paris', label: 'Paris', count: 2, isCorrect: true },
      { key: '0:Lyon', label: 'Lyon', count: 1, isCorrect: false },
    ]);
  });
});

describe('buildReport', () => {
  it('computes summary tiles', () => {
    const r = buildReport(input());
    expect(r.status).toBe('finished');
    expect(r.summary.players).toBe(3);
    expect(r.summary.questions).toBe(4);
    expect(r.summary.askedScored).toBe(3);
    // correct: q1 1, q2 2, q3 1 = 4 of 3 players x 3 scored questions
    expect(r.summary.accuracy).toBeCloseTo(4 / 9);
    expect(r.summary.avgScore).toBeCloseTo((2400 + 800 + 0) / 3);
    expect(r.summary.durationMs).toBe(125_000);
  });

  it('computes per-question accuracy, difficulty and distribution; polls are unscored', () => {
    const r = buildReport(input());
    const [q1, q2, q3, q4] = r.questions;
    expect(q1.accuracy).toBeCloseTo(1 / 3);
    expect(q1.difficult).toBe(true);
    expect(q2.accuracy).toBeCloseTo(2 / 3);
    expect(q2.difficult).toBe(false);
    expect(q2.answered).toBe(2);
    expect(q2.distribution.find((b) => b.key === '__none__')?.count).toBe(1);
    expect(q3.accuracy).toBeCloseTo(1 / 3);
    expect(q4.scored).toBe(false);
    expect(q4.accuracy).toBeNull();
    expect(q4.difficult).toBe(false);
    expect(q1.avgLatencyMs).toBe(1000);
  });

  it('ranks players by summary score and derives correct count, accuracy, streak and needs-help', () => {
    const r = buildReport(input());
    expect(r.players.map((p) => [p.rank, p.id, p.score])).toEqual([[1, 'ann', 2400], [2, 'bob', 800], [3, 'cat', 0]]);
    const ann = r.players[0];
    expect(ann.correct).toBe(3);
    expect(ann.total).toBe(3);
    expect(ann.accuracy).toBe(1);
    expect(ann.longestStreak).toBe(3);
    expect(ann.needsHelp).toBe(false);
    const bob = r.players[1];
    expect(bob.correct).toBe(1);
    expect(bob.longestStreak).toBe(1);
    expect(bob.needsHelp).toBe(true);
    const cat = r.players[2];
    expect(cat.correct).toBe(0);
    expect(cat.accuracy).toBe(0);
    expect(cat.needsHelp).toBe(true);
    // Per-question detail includes the unanswered question as a miss.
    expect(cat.answers.map((a) => [a.position, a.answered, a.isCorrect, a.answerLabel])).toEqual([
      [1, true, false, 'Gamma'], [2, false, false, 'No answer'], [3, true, false, 'Alpha'], [4, false, null, 'No answer'],
    ]);
    expect(r.teams).toBeNull();
  });

  it('excludes never-asked questions from denominators (host ended early)', () => {
    const r = buildReport(input({ answers: [ans('ann', 'q1', 'b', true), ans('bob', 'q1', 'a', false), ans('cat', 'q1', 'b', true)] }));
    expect(r.summary.askedScored).toBe(1);
    expect(r.summary.accuracy).toBeCloseTo(2 / 3);
    expect(r.questions[1].asked).toBe(false);
    expect(r.questions[1].accuracy).toBeNull();
    expect(r.questions[1].distribution).toEqual([
      { key: 'a', label: 'Alpha', count: 0, isCorrect: false },
      { key: 'b', label: 'Beta', count: 0, isCorrect: true },
      { key: 'c', label: 'Gamma', count: 0, isCorrect: false },
    ]);
    expect(r.players[0].total).toBe(1);
    expect(r.players[0].answers).toHaveLength(1);
  });

  it('builds team stats for team games', () => {
    const summary = {
      isTeam: true,
      players: [player('ann', 2400, 't1'), player('bob', 800, 't2'), player('cat', 0, 't1')],
      teams: [
        { id: 't1', name: 'Red', color: '#f00', score: 2400, rank: 0, memberCount: 2, members: [] },
        { id: 't2', name: 'Blue', color: '#00f', score: 800, rank: 0, memberCount: 1, members: [] },
      ],
      podium: { kind: 'teams', rows: [] },
    };
    const r = buildReport(input({}, summary));
    expect(r.teams).not.toBeNull();
    const [red, blue] = r.teams!;
    expect(red).toMatchObject({ id: 't1', rank: 1, score: 2400, memberCount: 2, correct: 3, total: 6 });
    expect(red.accuracy).toBeCloseTo(0.5);
    expect(red.members).toEqual(['ANN', 'CAT']);
    expect(blue).toMatchObject({ id: 't2', rank: 2, score: 800, correct: 1, total: 3 });
  });

  it('reports status live / empty', () => {
    const base = input({ answers: [] }, null);
    const live = buildReport({ ...base, session: { ...base.session, endedAt: null } });
    expect(live.status).toBe('live');
    expect(live.summary.players).toBe(0);
    expect(live.summary.accuracy).toBeNull();
    expect(live.summary.avgScore).toBeNull();
    expect(live.summary.durationMs).toBeNull();
    expect(live.players).toEqual([]);

    const empty = buildReport(input({ answers: [] }, { isTeam: false, players: [], teams: [], podium: { kind: 'players', rows: [] } }));
    expect(empty.status).toBe('empty');
  });

  it('falls back to answer points and prompts when the summary or a question is missing', () => {
    const r = buildReport(input({
      questions: [quizQ('q1', 0)],
      answers: [ans('ann', 'q1', 'b', true, 900), ans('ann', 'gone', 'Paris', true, 700), ans('bob', 'gone', 'Rome', false)],
    }, null));
    expect(r.players.map((p) => [p.id, p.score])).toEqual([['ann', 1600], ['bob', 0]]);
    const orphan = r.questions[1];
    expect(orphan.id).toBe('gone');
    expect(orphan.prompt).toBe('p');
    expect(orphan.position).toBe(2);
    expect(orphan.accuracy).toBe(0.5);
    expect(orphan.distribution.map((b) => [b.label, b.count, b.isCorrect])).toEqual([
      ['Paris', 1, true], ['Rome', 1, false],
    ]);
  });
});

describe('sortQuestions', () => {
  it('sorts hardest first and pushes unscored to the end', () => {
    const r = buildReport(input());
    expect(sortQuestions(r.questions, 'difficulty').map((q) => q.id)).toEqual(['q1', 'q3', 'q2', 'q4']);
    expect(sortQuestions(sortQuestions(r.questions, 'difficulty'), 'order').map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});

describe('csv', () => {
  it('escapes quotes, commas, newlines and formula prefixes', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('=1+1')).toBe("'=1+1");
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(42)).toBe('42');
  });
  it('playersCsv has a header and one row per player', () => {
    const lines = playersCsv(buildReport(input())).split('\n');
    expect(lines[0]).toBe('rank,nickname,team,score,correct,total,accuracy_pct,longest_streak,needs_help');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('1,ANN,,2400,3,3,100,3,no');
    expect(lines[3]).toBe('3,CAT,,0,0,3,0,0,yes');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatDuration(3_725_000)).toBe('1 h 2 min');
  });
});
