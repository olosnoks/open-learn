import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { formatUpdated } from './format';

/** Row shape of GET /api/quizzes (see worker/api/quizzes.ts). */
type Quiz = {
  id: string;
  title: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  questionCount: number;
};

export function QuizListPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiGet<Quiz[]>('/quizzes')
      .then(setQuizzes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  const duplicate = async (q: Quiz) => {
    setBusyId(q.id); setError(null);
    try {
      const copy = await apiPost<{ id: string; title: string }>(`/quizzes/${q.id}/duplicate`, {});
      await load();
      navigate(`/quizzes/${copy.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: Quiz) => {
    if (!confirm(`Delete "${q.title}" and its game history? This can't be undone.`)) return;
    setBusyId(q.id); setError(null);
    try {
      await apiDelete(`/quizzes/${q.id}`);
      setQuizzes((qs) => qs.filter((x) => x.id !== q.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <HostShell>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Your quizzes</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/quizzes/import')}>Import from spreadsheet</Button>
          <Button variant="secondary" onClick={() => navigate('/quizzes/new')}>New quiz</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-red-200">{error}</p>}
      {loading ? <p>Loading…</p> : quizzes.length === 0 ? (
        <Card className="bg-cream text-ink">
          <p className="mb-4">No quizzes yet.</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/quizzes/new')}>Create one</Button>
            <Button variant="secondary" onClick={() => navigate('/quizzes/import')}>Import from spreadsheet</Button>
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Card className="flex h-full flex-col bg-cream text-ink">
                <h2 className="mb-1 text-xl font-bold">{q.title}</h2>
                <p className="mb-3 text-sm text-ink-muted">{q.description || 'No description'}</p>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  {q.questionCount} {q.questionCount === 1 ? 'question' : 'questions'}
                  <span aria-hidden="true"> · </span>
                  <time dateTime={new Date(q.updatedAt).toISOString()} title={new Date(q.updatedAt).toLocaleString()}>
                    Updated {formatUpdated(q.updatedAt)}
                  </time>
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate(`/quizzes/${q.id}`)}>Edit</Button>
                  <Button size="sm" variant="secondary" disabled={busyId === q.id} onClick={() => duplicate(q)}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="danger" className="ml-auto" disabled={busyId === q.id} onClick={() => remove(q)}>
                    Delete
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
