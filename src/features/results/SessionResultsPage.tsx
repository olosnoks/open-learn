import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiDownload, apiGet } from '../../lib/api';
import { cn } from '../../lib/cn';
import {
  buildReport, formatDuration, modeLabel, parseSummary, pct, playersCsv, sortQuestions,
  type PlayerStat, type QuestionStat, type Report, type ReportInput, type TeamStat,
} from './report';

type Tab = 'questions' | 'players' | 'teams';

/** Save a string as a file from the browser (the players CSV is computed client-side). */
function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Small presentational pieces -----------------------------------------------------

function Bar({ ratio, tone = 'brand', className }: { ratio: number | null; tone?: 'brand' | 'good' | 'bad' | 'muted'; className?: string }) {
  const width = ratio === null ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const fill = {
    brand: 'bg-brand-500', good: 'bg-[var(--success)]', bad: 'bg-[var(--danger)]', muted: 'bg-ink-muted/40',
  }[tone];
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-cream-200', className)} role="presentation">
      <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${width}%` }} />
    </div>
  );
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'bad' | 'good' }) {
  const tones = {
    neutral: 'bg-cream-200 text-ink-muted',
    warn: 'bg-[var(--warning)] text-cream',
    bad: 'bg-[var(--danger)] text-cream',
    good: 'bg-brand-100 text-brand-800',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="bg-cream p-4 text-ink">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

// --- Tabs -------------------------------------------------------------------------------

function QuestionsTab({ questions, players }: { questions: QuestionStat[]; players: number }) {
  const [sortBy, setSortBy] = useState<'order' | 'difficulty'>('order');
  const sorted = useMemo(() => sortQuestions(questions, sortBy), [questions, sortBy]);
  const difficult = questions.filter((q) => q.difficult).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-200">
          {questions.length} questions{difficult > 0 && <> · <span className="font-semibold text-cream">{difficult} difficult</span> (under 35 % correct)</>}
        </p>
        <label className="flex items-center gap-2 text-sm text-brand-200">
          Sort by
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'order' | 'difficulty')}
            className="rounded-tile border border-brand-300 bg-cream px-2 py-1 text-ink"
          >
            <option value="order">Quiz order</option>
            <option value="difficulty">Hardest first</option>
          </select>
        </label>
      </div>
      <ol className="space-y-3">
        {sorted.map((q) => (
          <li key={q.id}>
            <Card className="bg-cream text-ink">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Question {q.position}</p>
                  <h3 className="text-lg font-bold">{q.prompt || <span className="italic text-ink-muted">(no prompt)</span>}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip>{q.type.replace('_', ' ')}</Chip>
                  {!q.scored && <Chip>unscored</Chip>}
                  {!q.asked && <Chip>no answers</Chip>}
                  {q.difficult && <Chip tone="bad">difficult</Chip>}
                </div>
              </div>

              {q.scored && q.asked && (
                <div className="mt-3 flex items-center gap-3">
                  <Bar ratio={q.accuracy} tone={q.difficult ? 'bad' : 'good'} className="flex-1" />
                  <span className="w-14 text-right text-sm font-bold">{pct(q.accuracy)}</span>
                </div>
              )}
              <p className="mt-1 text-xs text-ink-muted">
                {q.answered} of {players} answered
                {q.scored && q.asked && <> · {q.correct} correct</>}
                {q.avgLatencyMs !== null && <> · avg {(q.avgLatencyMs / 1000).toFixed(1)} s</>}
              </p>

              {q.distribution.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {q.distribution.map((b) => {
                    const share = players > 0 ? b.count / players : 0;
                    const tone = b.isCorrect === true ? 'good' : b.isCorrect === false ? 'bad' : 'muted';
                    return (
                      <li key={b.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_3rem] items-center gap-3 text-sm">
                        <span className={cn('truncate', b.isCorrect === true && 'font-bold')} title={b.label}>
                          {b.isCorrect === true && <span aria-label="correct" className="mr-1">✓</span>}
                          {b.label}
                        </span>
                        <Bar ratio={share} tone={tone} />
                        <span className="text-right tabular-nums">{b.count}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlayerDetail({ player }: { player: PlayerStat }) {
  return (
    <ol className="divide-y divide-cream-200 text-sm">
      {player.answers.map((a) => (
        <li key={a.questionId} className="grid grid-cols-[2rem_minmax(0,2fr)_minmax(0,2fr)_4rem_4rem] items-center gap-3 py-1.5">
          <span className="text-ink-muted">{a.position}.</span>
          <span className="truncate" title={a.prompt}>{a.prompt}</span>
          <span
            className={cn(
              'truncate',
              a.isCorrect === true && 'font-semibold text-[var(--success)]',
              a.isCorrect === false && a.answered && 'text-[var(--danger)]',
              !a.answered && 'italic text-ink-muted',
            )}
            title={a.answerLabel}
          >
            {a.isCorrect === true && '✓ '}{a.isCorrect === false && a.answered && '✗ '}{a.answerLabel}
          </span>
          <span className="text-right tabular-nums text-ink-muted">{a.latencyMs === null ? '—' : `${(a.latencyMs / 1000).toFixed(1)} s`}</span>
          <span className="text-right tabular-nums font-semibold">{a.scored ? `+${a.points}` : '—'}</span>
        </li>
      ))}
      {player.answers.length === 0 && <li className="py-2 text-ink-muted">No questions were asked.</li>}
    </ol>
  );
}

const PLAYER_COLS = 'grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_minmax(5rem,1fr)_4rem]';

function PlayersTab({ players, teams }: { players: PlayerStat[]; teams: TeamStat[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const teamById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t] as const)), [teams]);
  const needHelp = players.filter((p) => p.needsHelp).length;

  if (players.length === 0) return <Card className="bg-cream text-ink">Nobody joined this game.</Card>;

  return (
    <div>
      <p className="mb-4 text-sm text-brand-200">
        {players.length} players{needHelp > 0 && <> · <span className="font-semibold text-cream">{needHelp} need help</span> (under 35 % correct)</>}
        {' '}· click a player to see every answer
      </p>
      <Card className="bg-cream p-0 text-ink">
        <div className={cn('grid gap-3 border-b border-cream-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted', PLAYER_COLS)}>
          <span>#</span><span>Player</span><span className="text-right">Score</span><span className="text-right">Correct</span><span>Accuracy</span><span className="text-right">Streak</span>
        </div>
        <ul>
          {players.map((p) => {
            const team = p.teamId ? teamById.get(p.teamId) : undefined;
            const expanded = open === p.id;
            return (
              <li key={p.id} className="border-b border-cream-200 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : p.id)}
                  aria-expanded={expanded}
                  className={cn('grid w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-cream-100', PLAYER_COLS)}
                >
                  <span className="font-bold tabular-nums">{p.rank}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {team && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} title={team.name} />}
                    <span className="truncate font-semibold">{p.nickname}</span>
                    {p.needsHelp && <Chip tone="warn">needs help</Chip>}
                  </span>
                  <span className="text-right tabular-nums font-bold">{p.score}</span>
                  <span className="text-right tabular-nums">{p.correct} / {p.total}</span>
                  <span className="flex items-center gap-2">
                    <Bar ratio={p.accuracy} tone={p.needsHelp ? 'bad' : 'good'} className="flex-1" />
                    <span className="w-12 text-right tabular-nums">{pct(p.accuracy)}</span>
                  </span>
                  <span className="text-right tabular-nums">{p.longestStreak}</span>
                </button>
                {expanded && <div className="bg-cream-100 px-4 py-2"><PlayerDetail player={p} /></div>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

const TEAM_COLS = 'grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_minmax(5rem,1fr)]';

function TeamsTab({ teams }: { teams: TeamStat[] }) {
  if (teams.length === 0) return <Card className="bg-cream text-ink">No teams were formed.</Card>;
  return (
    <Card className="bg-cream p-0 text-ink">
      <div className={cn('grid gap-3 border-b border-cream-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted', TEAM_COLS)}>
        <span>#</span><span>Team</span><span className="text-right">Score</span><span className="text-right">Correct</span><span>Accuracy</span>
      </div>
      <ul>
        {teams.map((t) => (
          <li key={t.id} className={cn('grid items-center gap-3 border-b border-cream-200 px-4 py-2.5 text-sm last:border-0', TEAM_COLS)}>
            <span className="font-bold tabular-nums">{t.rank}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="font-semibold">{t.name}</span>
                <span className="text-ink-muted">({t.memberCount})</span>
              </span>
              {t.members.length > 0 && <span className="block truncate text-xs text-ink-muted">{t.members.join(', ')}</span>}
            </span>
            <span className="text-right tabular-nums font-bold">{t.score}</span>
            <span className="text-right tabular-nums">{t.correct} / {t.total}</span>
            <span className="flex items-center gap-2">
              <Bar ratio={t.accuracy} tone="good" className="flex-1" />
              <span className="w-12 text-right tabular-nums">{pct(t.accuracy)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Page ---------------------------------------------------------------------------------

export function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('questions');

  useEffect(() => {
    if (!id) return;
    apiGet<ReportInput>(`/sessions/${id}/report`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const report: Report | null = useMemo(() => (data ? buildReport(data) : null), [data]);

  if (loading) return <HostShell>Loading…</HostShell>;
  if (!data || !report) return <HostShell>{error ?? 'Not found.'}</HostShell>;

  const { session } = data;
  const isTeam = parseSummary(session.summaryJson)?.isTeam ?? false;
  const when = session.startedAt ?? session.endedAt;
  const activeTab: Tab = tab === 'teams' && !report.teams ? 'questions' : tab;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'questions', label: `Questions (${report.questions.length})` },
    { key: 'players', label: `Players (${report.players.length})` },
    ...(report.teams ? [{ key: 'teams' as Tab, label: `Teams (${report.teams.length})` }] : []),
  ];

  return (
    <HostShell>
      <p className="mb-3 text-sm"><Link to="/sessions" className="text-brand-200 hover:text-cream hover:underline">← Past games</Link></p>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1 truncate text-4xl font-bold">{session.quizTitle ?? 'Untitled quiz'}</h1>
          <p className="text-brand-300">
            Room {session.roomCode} · <span className="capitalize">{modeLabel(session.mode, isTeam)}</span>
            {when && <> · {new Date(when).toLocaleString()}</>}
          </p>
        </div>
        {report.status !== 'live' && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => downloadText(`session-${session.roomCode}-players.csv`, playersCsv(report))}>
              Players CSV
            </Button>
            <Button variant="secondary" onClick={() =>
              apiDownload(`/sessions/${session.id}/export.csv`, `session-${session.roomCode}-answers.csv`)
                .catch((e) => setError(e instanceof Error ? e.message : 'Export failed'))}>
              Answers CSV
            </Button>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {report.status === 'live' && (
        <Card className="mb-6 bg-cream text-ink">
          <p className="font-semibold">This game is still running.</p>
          <p className="text-sm text-ink-muted">Answers are saved when the host ends the game; come back then for the full report.</p>
        </Card>
      )}
      {report.status === 'empty' && (
        <Card className="mb-6 bg-cream text-ink">
          <p className="font-semibold">Nobody joined this game.</p>
          <p className="text-sm text-ink-muted">There is nothing to report.</p>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Players" value={report.summary.players} />
        <Tile
          label="Questions"
          value={report.summary.questions}
          hint={report.summary.askedScored !== report.summary.questions ? `${report.summary.askedScored} scored and asked` : undefined}
        />
        <Tile label="Accuracy" value={pct(report.summary.accuracy)} hint="correct of all possible answers" />
        <Tile label="Avg score" value={report.summary.avgScore === null ? '—' : Math.round(report.summary.avgScore)} />
        <Tile label="Duration" value={formatDuration(report.summary.durationMs)} />
      </div>

      {report.status === 'finished' && (
        <>
          <div role="tablist" className="mb-4 flex gap-1 border-b border-brand-500">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={activeTab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-t-tile px-4 py-2 text-sm font-semibold',
                  activeTab === t.key ? 'bg-cream text-ink' : 'text-brand-200 hover:text-cream',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {activeTab === 'questions' && <QuestionsTab questions={report.questions} players={report.summary.players} />}
          {activeTab === 'players' && <PlayersTab players={report.players} teams={report.teams} />}
          {activeTab === 'teams' && report.teams && <TeamsTab teams={report.teams} />}
        </>
      )}
    </HostShell>
  );
}
