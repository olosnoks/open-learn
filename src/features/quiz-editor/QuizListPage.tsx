import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { apiGet } from '../../lib/api';

type Quiz = { id: string; title: string; description: string | null; updatedAt: number };

export function QuizListPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Quiz[]>('/quizzes')
      .then(setQuizzes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <HostShell>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-4xl font-bold">Your quizzes</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/quizzes/import')}>Import from spreadsheet</Button>
          <Button variant="secondary" onClick={() => navigate('/quizzes/new')}>New quiz</Button>
        </div>
      </div>
      {error && <p className="mb-4 text-red-200">{error}</p>}
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
              <Card className="bg-cream text-ink">
                <h2 className="mb-1 text-xl font-bold">{q.title}</h2>
                <p className="mb-4 text-sm text-ink-muted">{q.description ?? 'No description'}</p>
                <Button size="sm" onClick={() => navigate(`/quizzes/${q.id}`)}>Edit</Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </HostShell>
  );
}
