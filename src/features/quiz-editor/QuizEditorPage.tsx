import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { QuestionForm, defaultConfigFor } from './QuestionForm';
import {
  draftSnapshot, duplicateQuestion, insertAfter, moveQuestion, toApiQuestion, TYPE_BADGE,
  type EditorQuestion,
} from './questionList';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';

const DEFAULT_QUESTION = (): EditorQuestion => ({
  type: 'quiz',
  prompt: '',
  timeLimitSec: 20,
  points: 1000,
  config: defaultConfigFor('quiz'),
  imageUrl: '',
});

const DARK_INPUT = 'border-brand-600 bg-brand-800 text-cream placeholder:text-brand-300';

type ApiQuiz = { title: string; description: string | null; questions: EditorQuestion[] };

export function QuizEditorPage({ isNew }: { isNew: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initial] = useState(() => ({ title: '', description: '', questions: [DEFAULT_QUESTION()] }));
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [questions, setQuestions] = useState<EditorQuestion[]>(initial.questions);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState(() => draftSnapshot(initial));
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew || !id) return;
    // Ignore responses from a superseded effect run (StrictMode mounts effects twice in
    // dev); otherwise a late duplicate load overwrites edits the host has already made.
    let stale = false;
    setLoading(true);
    apiGet<ApiQuiz>(`/quizzes/${id}`)
      .then((q) => {
        if (stale) return;
        const loaded = {
          title: q.title,
          description: q.description ?? '',
          questions: q.questions.length
            ? q.questions.map((x) => ({ ...x, imageUrl: x.imageUrl ?? '' }))
            : [DEFAULT_QUESTION()],
        };
        setTitle(loaded.title);
        setDescription(loaded.description);
        setQuestions(loaded.questions);
        setActiveIndex(0);
        setSavedSnapshot(draftSnapshot(loaded));
      })
      .catch((e) => { if (!stale) setError(e.message); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [id, isNew]);

  const currentSnapshot = useMemo(
    () => draftSnapshot({ title, description, questions }),
    [title, description, questions]
  );
  const dirty = currentSnapshot !== savedSnapshot;
  useUnsavedChangesGuard(dirty && !saving);

  const updateQuestion = (i: number, next: EditorQuestion) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? next : q)));

  const addQuestion = () => {
    setQuestions((qs) => [...qs, DEFAULT_QUESTION()]);
    setActiveIndex(questions.length);
  };

  const removeQuestion = (i: number) => {
    if (questions.length <= 1) return;
    const label = questions[i]?.prompt.trim() || `question ${i + 1}`;
    if (!confirm(`Delete "${label}"? This can't be undone once you save.`)) return;
    setQuestions((qs) => qs.filter((_, j) => j !== i));
    setActiveIndex((a) => (i < a ? a - 1 : Math.min(a, questions.length - 2)));
  };

  const duplicate = (i: number) => {
    setQuestions((qs) => insertAfter(qs, i, duplicateQuestion(qs[i])));
    setActiveIndex(i + 1);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    setQuestions((qs) => moveQuestion(qs, from, to));
    setActiveIndex((a) => (a === from ? to : a === to ? from : a));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const draft = { title: title.trim(), description: description.trim(), questions };
    const payload = {
      title: draft.title,
      description: draft.description || undefined,
      questions: questions.map(toApiQuestion),
    };
    try {
      if (isNew) {
        const created = await apiPost<{ id: string }>('/quizzes', payload);
        setSavedSnapshot(draftSnapshot(draft));
        navigate(`/quizzes/${created.id}`, { replace: true });
      } else {
        await apiPut(`/quizzes/${id}`, payload);
        setSavedSnapshot(draftSnapshot(draft));
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
      setSavedSnapshot(currentSnapshot);
      navigate('/quizzes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) return <HostShell><p>Loading…</p></HostShell>;
  const active = questions[activeIndex] ?? questions[0];

  return (
    <HostShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Input
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title" aria-label="Quiz title" maxLength={120}
          className={`${DARK_INPUT} min-w-0 flex-1 text-2xl font-bold`}
        />
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded-full bg-brand-800 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-200"
              data-testid="unsaved-badge">
              Unsaved changes
            </span>
          )}
          <Button variant="secondary" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
          {!isNew && <Button variant="danger" onClick={remove}>Delete</Button>}
        </div>
      </div>
      <Input
        value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)" aria-label="Description" maxLength={500}
        className={`mb-6 ${DARK_INPUT}`}
      />
      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-brand-200">{questions.length} {questions.length === 1 ? 'question' : 'questions'}</span>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="jump-to">Jump to question</label>
              <select
                id="jump-to"
                className="rounded-tile border border-brand-600 bg-brand-800 px-2 py-1 text-cream"
                value={activeIndex}
                onChange={(e) => setActiveIndex(Number(e.target.value))}
              >
                {questions.map((q, i) => (
                  <option key={i} value={i}>Q{i + 1}{q.prompt ? ` · ${q.prompt.slice(0, 30)}` : ''}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => setCompact((c) => !c)} aria-pressed={compact}>
                {compact ? 'Expand list' : 'Collapse list'}
              </Button>
            </div>
          </div>
          <ol className="space-y-2" aria-label="Questions">
            {questions.map((q, i) => (
              <li key={i} className={`rounded-tile ${i === activeIndex ? 'bg-cream text-ink' : 'bg-brand-800 text-cream'}`}>
                <button type="button" onClick={() => setActiveIndex(i)}
                  className={`w-full rounded-tile p-3 text-left ${i === activeIndex ? '' : 'hover:bg-brand-600'}`}>
                  <p className={`flex items-center gap-2 text-xs uppercase tracking-widest ${i === activeIndex ? 'text-ink-muted' : 'text-brand-400'}`}>
                    <span>Q{i + 1} · {q.type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal ${
                      i === activeIndex ? 'bg-brand-100 text-brand-700' : 'bg-brand-600 text-cream'}`}>
                      {TYPE_BADGE[q.type]}
                    </span>
                    {q.imageUrl?.trim() ? <span aria-label="has image" title="Has image">🖼</span> : null}
                  </p>
                  <p className={`font-semibold ${compact ? 'truncate' : 'line-clamp-2'}`}>{q.prompt || 'Untitled question'}</p>
                  {!compact && (
                    <p className={`mt-1 text-xs ${i === activeIndex ? 'text-ink-muted' : 'text-brand-300'}`}>
                      {q.timeLimitSec}s · {q.points} pts
                    </p>
                  )}
                </button>
                {!compact && (
                  <div className="flex gap-1 px-2 pb-2">
                    <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} up`} title="Move up"
                      disabled={i === 0} onClick={() => move(i, i - 1)}>↑</Button>
                    <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} down`} title="Move down"
                      disabled={i === questions.length - 1} onClick={() => move(i, i + 1)}>↓</Button>
                    <Button size="sm" variant="ghost" aria-label={`Duplicate question ${i + 1}`} title="Duplicate"
                      onClick={() => duplicate(i)}>⧉</Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete question ${i + 1}`} title="Delete"
                      className="ml-auto" disabled={questions.length <= 1} onClick={() => removeQuestion(i)}>×</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button variant="secondary" onClick={addQuestion} className="w-full">+ Add question</Button>
        </aside>
        <section>
          <Card className="bg-cream text-ink">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Question {activeIndex + 1}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => duplicate(activeIndex)}>Duplicate</Button>
                <Button size="sm" variant="danger" onClick={() => removeQuestion(activeIndex)} disabled={questions.length <= 1}>
                  Remove
                </Button>
              </div>
            </div>
            <QuestionForm question={active} onChange={(next) => updateQuestion(activeIndex, next)} />
          </Card>
        </section>
      </div>
    </HostShell>
  );
}
