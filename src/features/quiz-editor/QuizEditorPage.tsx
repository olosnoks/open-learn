import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { QuestionForm, defaultConfigFor, type EditorQuestion } from './QuestionForm';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';

const DEFAULT_QUESTION = (): EditorQuestion => ({
  type: 'quiz',
  prompt: '',
  timeLimitSec: 20,
  points: 1000,
  config: defaultConfigFor('quiz'),
});

const DARK_INPUT = 'border-brand-600 bg-brand-800 text-cream placeholder:text-brand-300';

export function QuizEditorPage({ isNew }: { isNew: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<EditorQuestion[]>([DEFAULT_QUESTION()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    // Ignore responses from a superseded effect run (StrictMode mounts effects twice in
    // dev); otherwise a late duplicate load overwrites edits the host has already made.
    let stale = false;
    apiGet<{ title: string; description: string | null; questions: EditorQuestion[] }>(`/quizzes/${id}`)
      .then((q) => {
        if (stale) return;
        setTitle(q.title);
        setDescription(q.description ?? '');
        setQuestions(q.questions.length ? q.questions : [DEFAULT_QUESTION()]);
      })
      .catch((e) => { if (!stale) setError(e.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [id, isNew]);

  const updateQuestion = (i: number, next: EditorQuestion) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? next : q)));

  const addQuestion = () => {
    setQuestions((qs) => [...qs, DEFAULT_QUESTION()]);
    setActiveIndex(questions.length);
  };

  const deleteQuestion = (i: number) => {
    setQuestions((qs) => qs.filter((_, j) => j !== i));
    setActiveIndex(Math.max(0, Math.min(activeIndex, questions.length - 2)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      title,
      description: description || undefined,
      questions: questions.map((q) => ({
        type: q.config, prompt: q.prompt,
        timeLimitSec: q.timeLimitSec, points: q.points,
      })),
    };
    try {
      if (isNew) {
        const created = await apiPost<{ id: string }>('/quizzes', payload);
        navigate(`/quizzes/${created.id}`, { replace: true });
      } else {
        await apiPut(`/quizzes/${id}`, payload);
        navigate('/quizzes');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !confirm('Delete this quiz and its game history?')) return;
    try {
      await apiDelete(`/quizzes/${id}`);
      navigate('/quizzes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) return <HostShell><p>Loading…</p></HostShell>;
  const active = questions[activeIndex];

  return (
    <HostShell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Input
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title" aria-label="Quiz title"
          className={`${DARK_INPUT} text-2xl font-bold`}
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
          {!isNew && <Button variant="danger" onClick={remove}>Delete</Button>}
        </div>
      </div>
      <Input
        value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)" aria-label="Description"
        className={`mb-6 ${DARK_INPUT}`}
      />
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {questions.map((q, i) => (
            <button key={i} type="button" onClick={() => setActiveIndex(i)}
              className={`w-full rounded-tile p-3 text-left ${i === activeIndex ? 'bg-cream text-ink' : 'bg-brand-800 text-cream hover:bg-brand-600'}`}>
              <p className="text-xs uppercase tracking-widest text-brand-400">Q{i + 1} · {q.type}</p>
              <p className="truncate font-semibold">{q.prompt || 'Untitled question'}</p>
            </button>
          ))}
          <Button variant="secondary" onClick={addQuestion} className="w-full">+ Add question</Button>
        </aside>
        <section>
          <Card className="bg-cream text-ink">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Question {activeIndex + 1}</h2>
              <Button size="sm" variant="danger" onClick={() => deleteQuestion(activeIndex)} disabled={questions.length <= 1}>
                Remove
              </Button>
            </div>
            <QuestionForm question={active} onChange={(next) => updateQuestion(activeIndex, next)} />
          </Card>
        </section>
      </div>
    </HostShell>
  );
}
