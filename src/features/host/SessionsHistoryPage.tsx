import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiDownload, apiGet } from '../../lib/api';
import { modeLabel, overallAccuracy, pct } from '../results/report';

/** One row of GET /api/sessions. */
type SessionRow = {
  id: string;
  quizId: string;
  quizTitle: string | null;
  roomCode: string;
  mode: string;
  startedAt: number | null;
  endedAt: number | null;
  isTeam: boolean;
  /** Players who joined (from the summary); null while the game is live. */
  playerCount: number | null;
  answerCount: number;
  correctCount: number;
  /** Distinct scored questions that received at least one answer. */
  askedCount: number;
};

function StatusChip({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning)] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-cream">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cream" aria-hidden />
      Live
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-800">
      Finished
    </span>
  );
}

export function SessionsHistoryPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SessionRow[]>('/sessions')
      .then((list) => setRows([...list].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = (r: SessionRow) =>
    apiDownload(`/sessions/${r.id}/export.csv`, `session-${r.roomCode}-answers.csv`)
      .catch((e) => setError(e instanceof Error ? e.message : 'Export failed'));

  return (
    <HostShell>
      <h1 className="mb-8 text-4xl font-bold">Past games</h1>
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <Card className="bg-cream text-ink"><p>No games yet. Start one from <Link className="underline" to="/host/create">Start a game</Link>.</p></Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const live = !r.endedAt;
            const when = r.startedAt ?? r.endedAt;
            const accuracy = live ? null : overallAccuracy(r.correctCount, r.playerCount ?? 0, r.askedCount);
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-4 bg-cream text-ink">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <Link to={`/sessions/${r.id}`} className="truncate text-lg font-bold hover:underline">
                        {r.quizTitle ?? 'Untitled quiz'}
                      </Link>
                      <StatusChip live={live} />
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {when ? new Date(when).toLocaleString() : 'Not started'} · Room {r.roomCode} ·{' '}
                      <span className="capitalize">{modeLabel(r.mode, r.isTeam)}</span>
                    </p>
                  </div>
                  <dl className="flex gap-6 text-sm">
                    <div>
                      <dt className="text-ink-muted">Players</dt>
                      <dd className="text-xl font-bold">{r.playerCount ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Accuracy</dt>
                      <dd className="text-xl font-bold">{pct(accuracy)}</dd>
                    </div>
                  </dl>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => exportCsv(r)} disabled={live}>
                      Answers CSV
                    </Button>
                    <Link to={`/sessions/${r.id}`}>
                      <Button size="sm">Report</Button>
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </HostShell>
  );
}
