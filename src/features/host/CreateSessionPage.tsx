import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { apiGet, apiPost } from '../../lib/api';

type QuizSummary = { id: string; title: string; description: string | null };
type SessionResp = { sessionId: string; roomCode: string; hostToken: string };

export function CreateSessionPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'classic' | 'accuracy' | 'lecture'>('classic');
  const [isTeam, setIsTeam] = useState(false);
  const [teamCount, setTeamCount] = useState<2 | 3 | 4>(2);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<QuizSummary[]>('/quizzes')
      .then((rows) => { setQuizzes(rows); if (rows[0]) setSelected(rows[0].id); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const start = async () => {
    if (!selected) return;
    setError(null);
    setCreating(true);
    try {
      const session = await apiPost<SessionResp>('/sessions', { quizId: selected, mode, isTeam, teamCount });
      sessionStorage.setItem('hostToken', session.hostToken);
      navigate(`/host/${session.sessionId}/${session.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
      setCreating(false);
    }
  };

  if (loading) return <HostShell><p>Loading quizzes…</p></HostShell>;

  return (
    <HostShell>
      <h1 className="mb-8 text-4xl font-bold">Start a game</h1>
      {quizzes.length === 0 ? (
        <Card className="bg-cream text-ink">
          <p className="mb-4 text-lg">You don't have any quizzes yet.</p>
          <Button onClick={() => navigate('/quizzes/new')}>Create your first quiz</Button>
        </Card>
      ) : (
        <>
          <Card className="mb-6 bg-cream text-ink">
            <label htmlFor="quiz-select" className="mb-2 block text-sm font-semibold text-ink-muted">Choose a quiz</label>
            <select id="quiz-select" className="w-full rounded-tile border-2 border-brand-200 bg-white p-3 text-lg"
              value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </Card>

          <Card className="mb-6 bg-cream text-ink">
            <p className="mb-2 block text-sm font-semibold text-ink-muted">Game mode</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(['classic', 'accuracy', 'lecture'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={`rounded-tile border-2 p-4 text-left font-semibold capitalize ${
                    mode === m ? 'border-brand-700 bg-brand-100 text-brand-700' : 'border-brand-200 bg-white text-ink'
                  }`}>
                  {m}
                  <span className="mt-1 block text-xs font-normal normal-case text-ink-muted">
                    {m === 'classic' && 'Speed-weighted scoring'}
                    {m === 'accuracy' && 'Correctness only'}
                    {m === 'lecture' && 'Host-paced, no scores'}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="mb-6 bg-cream text-ink">
            <label className="flex items-center justify-between">
              <span>
                <span className="block font-semibold">Team mode</span>
                <span className="block text-sm text-ink-muted">Players compete as color teams</span>
              </span>
              <input type="checkbox" checked={isTeam} onChange={(e) => setIsTeam(e.target.checked)} className="h-6 w-6" />
            </label>
            {isTeam && (
              <div className="mt-3 flex gap-2">
                {([2, 3, 4] as const).map((n) => (
                  <Button key={n} size="sm" variant={teamCount === n ? 'primary' : 'secondary'}
                    onClick={() => setTeamCount(n)}>{n} teams</Button>
                ))}
              </div>
            )}
          </Card>

          {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <div className="flex gap-4">
            <Button size="lg" variant="secondary" onClick={start} disabled={!selected || creating}>
              {creating ? 'Creating…' : 'Create room'}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/quizzes/new')}>New quiz</Button>
          </div>
        </>
      )}
    </HostShell>
  );
}
