import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { apiPost } from '../../lib/api';
import { parseQuizText, TEMPLATE_CSV, type ImportedQuestion } from './parseQuiz';

const TYPE_LABEL: Record<string, string> = {
  quiz: 'Quiz', multi_select: 'Multi', true_false: 'True/False', type_answer: 'Type answer',
  poll: 'Poll', puzzle: 'Puzzle', slide: 'Slide', slider: 'Slider', drop_pin: 'Drop pin', scale: 'Scale',
};

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'quiz-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

export function QuizImportPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(() => (text.trim() ? parseQuizText(text) : null), [text]);
  const effectiveTitle = title.trim() || result?.title?.trim() || '';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setText(await file.text());
    if (!title.trim()) setTitle(file.name.replace(/\.(csv|tsv|txt|json)$/i, '').replace(/[-_]+/g, ' ').trim());
  };

  const save = async () => {
    if (!result?.questions.length || !effectiveTitle) return;
    setSaving(true); setError(null);
    try {
      const { id } = await apiPost<{ id: string }>('/quizzes', {
        title: effectiveTitle.slice(0, 120),
        questions: result.questions,
      });
      navigate(`/quizzes/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setSaving(false);
    }
  };

  return (
    <HostShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">Import a quiz</h1>
        <Button variant="secondary" onClick={downloadTemplate}>Download template (CSV)</Button>
      </div>

      <Card className="mb-6 bg-cream text-ink">
        <h2 className="mb-2 text-lg font-bold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Download the template and open it in Google Sheets or Excel. Use one row per question.</li>
          <li>Columns: <b>question</b>, <b>type</b>, <b>answer1–answer6</b>, <b>correct</b>, <b>time</b> (seconds), and <b>points</b>.</li>
          <li><b>correct</b> is the answer <i>number</i>: <code>2</code> for answer2, or <code>1,3</code> when more than one is correct. You can also type the answer text itself. For true/false, use <code>true</code> or <code>false</code>.</li>
          <li><b>type</b> can be left blank for normal multiple choice. Other options are <code>multi</code>, <code>truefalse</code>, <code>type</code> (players type the answer; every answer column is accepted), <code>poll</code>, <code>puzzle</code> (answers in the right order), and <code>slide</code>.</li>
          <li>Upload the file below, or copy the rows (with the header) and paste them in.</li>
        </ol>
      </Card>

      <Card className="mb-6 space-y-4 bg-cream text-ink">
        <div>
          <label htmlFor="import-title" className="mb-1 block text-sm font-semibold text-ink-muted">Quiz title</label>
          <Input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={result?.title ?? 'e.g. Year 7 Science — Space'} maxLength={120} />
        </div>
        <div>
          <label htmlFor="import-file" className="mb-1 block text-sm font-semibold text-ink-muted">Upload a file (.csv, .tsv or .json)</label>
          <input id="import-file" type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-tile file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:font-semibold file:text-cream" />
        </div>
        <div>
          <label htmlFor="import-text" className="mb-1 block text-sm font-semibold text-ink-muted">…or paste rows from a spreadsheet</label>
          <textarea id="import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={TEMPLATE_CSV.split('\n').slice(0, 3).join('\n')}
            className="w-full rounded-tile border-2 border-brand-200 bg-white p-3 font-mono text-sm focus:border-brand-700 focus:outline-none" />
        </div>
      </Card>

      {result && result.errors.length > 0 && (
        <Card role="alert" className="mb-6 border-2 border-[var(--danger)] bg-cream text-ink">
          <h2 className="mb-2 font-bold">
            {result.errors.length} {result.errors.length === 1 ? 'row was' : 'rows were'} skipped. Fix them and paste again, or import without them.
          </h2>
          <ul className="space-y-1 text-sm">
            {result.errors.map((e, i) => <li key={i}><b>Row {e.row}:</b> {e.message}</li>)}
          </ul>
        </Card>
      )}

      {result && result.questions.length > 0 && (
        <Card className="mb-6 bg-cream text-ink">
          <h2 className="mb-3 text-lg font-bold">Preview: {result.questions.length} {result.questions.length === 1 ? 'question' : 'questions'}</h2>
          <ol className="space-y-3">
            {result.questions.map((q, i) => <PreviewRow key={i} q={q} n={i + 1} />)}
          </ol>
        </Card>
      )}

      {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" variant="secondary" onClick={save}
          disabled={saving || !result?.questions.length || !effectiveTitle}>
          {saving ? 'Importing…' : `Import ${result?.questions.length ?? 0} questions`}
        </Button>
        {result?.questions.length && !effectiveTitle ? <span className="text-brand-200">Add a quiz title to import.</span> : null}
      </div>
    </HostShell>
  );
}

function PreviewRow({ q, n }: { q: ImportedQuestion; n: number }) {
  const c = q.type;
  let answers: { label: string; correct?: boolean }[] = [];
  let note = '';
  switch (c.type) {
    case 'quiz': case 'multi_select':
      answers = c.choices.map((ch) => ({ label: ch.label, correct: ch.isCorrect })); break;
    case 'poll': answers = c.choices.map((ch) => ({ label: ch.label })); note = 'No correct answer'; break;
    case 'true_false': answers = [{ label: 'True', correct: c.correct }, { label: 'False', correct: !c.correct }]; break;
    case 'type_answer': answers = c.acceptedAnswers.map((a) => ({ label: a, correct: true })); note = 'Accepted answers'; break;
    case 'puzzle': answers = c.items.map((it, i) => ({ label: `${i + 1}. ${it.label}` })); note = 'Correct order'; break;
    case 'slide': note = c.body; break;
    default: note = '';
  }
  return (
    <li className="rounded-tile border border-brand-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{n}. {q.prompt}</p>
        <span className="text-xs text-ink-muted">{TYPE_LABEL[c.type]} · {q.timeLimitSec}s · {q.points} pts</span>
      </div>
      {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
      {answers.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {answers.map((a, i) => (
            <li key={i} className={`rounded-full px-3 py-0.5 text-sm ${
              a.correct ? 'bg-answer-green font-semibold text-cream' : 'bg-brand-50 text-ink'
            }`}>
              {a.correct && <span aria-hidden="true">✓ </span>}{a.label}
              {a.correct && <span className="sr-only"> (correct)</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
