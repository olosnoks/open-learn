import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiDownload, apiGet } from '../../lib/api';
import type { Standings } from '../../shared/types';

type SessionDetail = {
  id: string; roomCode: string; mode: string;
  startedAt: number | null; endedAt: number | null; summaryJson: string | null;
};

type Summary = {
  isTeam: boolean;
  players: { id: string; nickname: string; score: number }[];
  teams: { id: string; name: string; color: string; score: number; memberCount: number }[];
  podium: Standings;
};

export function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<SessionDetail>(`/sessions/${id}`)
      .then(setRow)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <HostShell>Loading…</HostShell>;
  if (!row) return <HostShell>{error ?? 'Not found.'}</HostShell>;

  const summary = row.summaryJson ? (JSON.parse(row.summaryJson) as Summary) : null;

  return (
    <HostShell>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold">Room {row.roomCode}</h1>
          <p className="capitalize text-brand-300">{row.mode}</p>
        </div>
        {row.endedAt && (
          <Button variant="secondary" onClick={() =>
            apiDownload(`/sessions/${row.id}/export.csv`, `session-${row.roomCode}.csv`)
              .catch((e) => setError(e instanceof Error ? e.message : 'Export failed'))}>
            Export CSV
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {summary ? (
        <>
          <Card className="mb-6 bg-cream text-ink">
            <h2 className="mb-3 text-lg font-bold">{summary.isTeam ? 'Team podium' : 'Podium'}</h2>
            <ol className="space-y-1">
              {summary.podium.kind === 'teams'
                ? summary.podium.rows.map((t) => (
                    <li key={t.id} className="flex justify-between font-semibold">
                      <span className="flex items-center gap-2">
                        <span>{t.rank}.</span>
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                      <span>{t.score}</span>
                    </li>
                  ))
                : summary.podium.rows.map((p) => (
                    <li key={p.id} className="flex justify-between font-semibold">
                      <span>{p.rank}. {p.nickname}</span>
                      <span>{p.score}</span>
                    </li>
                  ))}
            </ol>
          </Card>
          {summary.isTeam && summary.teams.length > 0 && (
            <Card className="mb-6 bg-cream text-ink">
              <h2 className="mb-3 text-lg font-bold">Teams</h2>
              <ul className="space-y-1">
                {summary.teams.map((t) => (
                  <li key={t.id} className="flex justify-between">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name} ({t.memberCount})
                    </span>
                    <span>{t.score}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="bg-cream text-ink">
            <h2 className="mb-3 text-lg font-bold">All players</h2>
            <ol className="space-y-1">
              {summary.players.slice().sort((a, b) => b.score - a.score).map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.nickname}</span>
                  <span>{p.score}</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : (
        <Card className="bg-cream text-ink">This session has not finished yet.</Card>
      )}
    </HostShell>
  );
}
