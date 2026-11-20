import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiDownload, apiGet } from '../../lib/api';

type SessionRow = {
  id: string; roomCode: string; mode: string;
  startedAt: number | null; endedAt: number | null; quizId: string;
};

export function SessionsHistoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SessionRow[]>('/sessions')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = (r: SessionRow) =>
    apiDownload(`/sessions/${r.id}/export.csv`, `session-${r.roomCode}.csv`)
      .catch((e) => setError(e instanceof Error ? e.message : 'Export failed'));

  return (
    <HostShell>
      <h1 className="mb-8 text-4xl font-bold">Past games</h1>
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <Card className="bg-cream text-ink"><p>No sessions yet.</p></Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex items-center justify-between bg-cream text-ink">
                <div>
                  <p className="font-bold">Room {r.roomCode}</p>
                  <p className="text-sm text-ink-muted">
                    {r.mode} · {r.endedAt ? new Date(r.endedAt).toLocaleString() : 'In progress'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => exportCsv(r)} disabled={!r.endedAt}>
                    Export CSV
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/sessions/${r.id}`)} disabled={!r.endedAt}>
                    Results
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </HostShell>
  );
}
