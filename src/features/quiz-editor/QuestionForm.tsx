import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { QuestionType } from '../../shared/schemas';
import { isValidImageUrl, POINTS_PRESETS, TIME_PRESETS, type EditorQuestion } from './questionList';

export type { EditorQuestion } from './questionList';

const TYPE_LABELS: Record<QuestionType, string> = {
  quiz: 'Quiz (single answer)',
  true_false: 'True / False',
  type_answer: 'Type Answer',
  puzzle: 'Puzzle',
  poll: 'Poll',
  slide: 'Slide',
  multi_select: 'Multi-select',
  slider: 'Slider',
  drop_pin: 'Drop Pin',
  scale: 'Scale',
};

export function defaultConfigFor(type: QuestionType): any {
  switch (type) {
    case 'quiz':
      return {
        type: 'quiz',
        choices: [
          { id: crypto.randomUUID(), label: 'Answer 1', isCorrect: true },
          { id: crypto.randomUUID(), label: 'Answer 2', isCorrect: false },
        ],
      };
    case 'true_false':
      return { type: 'true_false', correct: true };
    case 'type_answer':
      return { type: 'type_answer', acceptedAnswers: [''], caseSensitive: false };
    case 'puzzle': {
      const items = [
        { id: crypto.randomUUID(), label: 'First' },
        { id: crypto.randomUUID(), label: 'Second' },
        { id: crypto.randomUUID(), label: 'Third' },
      ];
      return { type: 'puzzle', items, correctOrder: items.map((i) => i.id) };
    }
    case 'poll':
      return {
        type: 'poll',
        choices: [
          { id: crypto.randomUUID(), label: 'Option A' },
          { id: crypto.randomUUID(), label: 'Option B' },
        ],
      };
    case 'slide':
      return { type: 'slide', body: '' };
    case 'multi_select':
      return {
        type: 'multi_select',
        choices: [
          { id: crypto.randomUUID(), label: 'Choice 1', isCorrect: true },
          { id: crypto.randomUUID(), label: 'Choice 2', isCorrect: false },
        ],
        partialCredit: false,
      };
    case 'slider':
      return { type: 'slider', min: 0, max: 100, step: 1, correct: 50, tolerance: 0 };
    case 'drop_pin':
      return {
        type: 'drop_pin',
        imageUrl: 'https://placehold.co/600x400',
        correctX: 0.5, correctY: 0.5, tolerance: 0.1,
      };
    case 'scale':
      return { type: 'scale', minLabel: 'Disagree', maxLabel: 'Agree', steps: 5 };
  }
}

export function QuestionForm({
  question, onChange,
}: {
  question: EditorQuestion;
  onChange: (next: EditorQuestion) => void;
}) {
  const setType = (type: QuestionType) => {
    if (type === question.type) return;
    onChange({ ...question, type, config: defaultConfigFor(type) });
  };
  const setConfig = (patch: Partial<any>) =>
    onChange({ ...question, config: { ...question.config, ...patch } });
  const syncPuzzleOrder = (items: { id: string; label: string }[]) =>
    setConfig({ items, correctOrder: items.map((i) => i.id) });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="q-type" className="mb-1 block text-sm font-semibold text-ink-muted">Type</label>
        <select
          id="q-type"
          className="w-full rounded-tile border-2 border-brand-200 bg-white p-3"
          value={question.type}
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="q-prompt" className="mb-1 block text-sm font-semibold text-ink-muted">Prompt</label>
        <Input
          id="q-prompt"
          value={question.prompt}
          onChange={(e) => onChange({ ...question, prompt: e.target.value })}
          placeholder="Ask your question"
        />
      </div>
      <ImageUrlField
        value={question.imageUrl ?? ''}
        onChange={(imageUrl) => onChange({ ...question, imageUrl })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="q-time" className="mb-1 block text-sm font-semibold text-ink-muted">Time limit (s)</label>
          <Input id="q-time" type="number" min={5} max={240} value={question.timeLimitSec}
            onChange={(e) => onChange({ ...question, timeLimitSec: Number(e.target.value) || 20 })} />
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Time presets">
            {TIME_PRESETS.map((s) => (
              <Button key={s} size="sm" type="button"
                variant={question.timeLimitSec === s ? 'primary' : 'secondary'}
                aria-pressed={question.timeLimitSec === s}
                aria-label={`${s} seconds`}
                onClick={() => onChange({ ...question, timeLimitSec: s })}>
                {s}s
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="q-points" className="mb-1 block text-sm font-semibold text-ink-muted">Points</label>
          <Input id="q-points" type="number" min={0} max={2000} value={question.points}
            onChange={(e) => onChange({ ...question, points: Number(e.target.value) || 0 })} />
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Score presets">
            {POINTS_PRESETS.map((p) => (
              <Button key={p.value} size="sm" type="button"
                variant={question.points === p.value ? 'primary' : 'secondary'}
                aria-pressed={question.points === p.value}
                onClick={() => onChange({ ...question, points: p.value })}>
                {p.label} · {p.value}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <hr className="border-brand-200" />

      {(question.type === 'quiz' || question.type === 'multi_select') && (
        <ChoicesEditor config={question.config} multi={question.type === 'multi_select'} onChange={setConfig} />
      )}

      {question.type === 'poll' && <PollChoicesEditor config={question.config} onChange={setConfig} />}

      {question.type === 'true_false' && (
        <div>
          <p className="mb-1 block text-sm font-semibold text-ink-muted">Correct answer</p>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <Button key={String(v)} variant={question.config.correct === v ? 'primary' : 'secondary'}
                aria-pressed={question.config.correct === v}
                onClick={() => setConfig({ correct: v })}>
                {v ? 'True' : 'False'}
              </Button>
            ))}
          </div>
        </div>
      )}

      {question.type === 'type_answer' && (
        <div className="space-y-2">
          <p className="mb-1 block text-sm font-semibold text-ink-muted">Accepted answers</p>
          {question.config.acceptedAnswers.map((a: string, i: number) => (
            <div key={i} className="flex gap-2">
              <Input value={a} onChange={(e) => {
                const next = [...question.config.acceptedAnswers];
                next[i] = e.target.value;
                setConfig({ acceptedAnswers: next });
              }} placeholder={`Answer variant ${i + 1}`} aria-label={`Answer variant ${i + 1}`} />
              <Button variant="ghost" onClick={() => {
                const next = question.config.acceptedAnswers.filter((_: string, j: number) => j !== i);
                setConfig({ acceptedAnswers: next.length ? next : [''] });
              }}>×</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary"
            onClick={() => setConfig({ acceptedAnswers: [...question.config.acceptedAnswers, ''] })}>
            + Add variant
          </Button>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={question.config.caseSensitive}
              onChange={(e) => setConfig({ caseSensitive: e.target.checked })} />
            Case sensitive
          </label>
        </div>
      )}

      {question.type === 'puzzle' && (
        <div className="space-y-2">
          <p className="mb-1 block text-sm font-semibold text-ink-muted">Items (in the correct order)</p>
          {question.config.items.map((item: { id: string; label: string }, i: number) => (
            <div key={item.id} className="flex gap-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-brand-100 font-bold text-brand-700">{i + 1}</span>
              <Input value={item.label} aria-label={`Item ${i + 1}`} onChange={(e) => {
                const next = [...question.config.items];
                next[i] = { ...item, label: e.target.value };
                syncPuzzleOrder(next);
              }} />
              <Button variant="ghost" disabled={question.config.items.length <= 3} onClick={() => {
                syncPuzzleOrder(question.config.items.filter((_: any, j: number) => j !== i));
              }}>×</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary"
            onClick={() => syncPuzzleOrder([...question.config.items, { id: crypto.randomUUID(), label: 'New item' }])}>
            + Add item
          </Button>
        </div>
      )}

      {question.type === 'slide' && (
        <div>
          <label htmlFor="q-body" className="mb-1 block text-sm font-semibold text-ink-muted">Slide content</label>
          <textarea id="q-body" className="w-full rounded-tile border-2 border-brand-200 p-3" rows={6}
            value={question.config.body} onChange={(e) => setConfig({ body: e.target.value })}
            placeholder="Teaching content shown to players" />
        </div>
      )}

      {question.type === 'slider' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Min" value={question.config.min} onChange={(v) => setConfig({ min: v })} />
          <NumberField label="Max" value={question.config.max} onChange={(v) => setConfig({ max: v })} />
          <NumberField label="Step" value={question.config.step} onChange={(v) => setConfig({ step: v })} />
          <NumberField label="Correct value" value={question.config.correct ?? 0} onChange={(v) => setConfig({ correct: v })} />
          <NumberField label="Tolerance" value={question.config.tolerance} onChange={(v) => setConfig({ tolerance: v })} />
        </div>
      )}

      {question.type === 'drop_pin' && (
        <div className="space-y-3">
          <Input value={question.config.imageUrl} onChange={(e) => setConfig({ imageUrl: e.target.value })}
            placeholder="Image URL" aria-label="Image URL" />
          <p className="text-sm text-ink-muted">Click the image to set the correct point.</p>
          <div className="relative inline-block">
            <img src={question.config.imageUrl} alt="Drop pin reference"
              className="max-w-full cursor-crosshair rounded"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setConfig({
                  correctX: (e.clientX - rect.left) / rect.width,
                  correctY: (e.clientY - rect.top) / rect.height,
                });
              }} />
            <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white"
              style={{ left: `${question.config.correctX * 100}%`, top: `${question.config.correctY * 100}%` }} />
          </div>
          <NumberField label="Tolerance (fraction of width)" value={question.config.tolerance}
            onChange={(v) => setConfig({ tolerance: v })} />
        </div>
      )}

      {question.type === 'scale' && (
        <div className="space-y-3">
          <Input value={question.config.minLabel} onChange={(e) => setConfig({ minLabel: e.target.value })}
            placeholder="Low label" aria-label="Low label" />
          <Input value={question.config.maxLabel} onChange={(e) => setConfig({ maxLabel: e.target.value })}
            placeholder="High label" aria-label="High label" />
          <NumberField label="Steps (3–7)" value={question.config.steps}
            onChange={(v) => setConfig({ steps: Math.max(3, Math.min(7, v)) })} />
        </div>
      )}
    </div>
  );
}

function ChoicesEditor({ config, multi, onChange }: { config: any; multi: boolean; onChange: (patch: any) => void }) {
  const add = () => onChange({ choices: [...config.choices, { id: crypto.randomUUID(), label: 'New option', isCorrect: false }] });
  const remove = (i: number) => onChange({ choices: config.choices.filter((_: any, j: number) => j !== i) });
  const update = (i: number, patch: any) => onChange({
    choices: config.choices.map((c: any, j: number) => (j === i ? { ...c, ...patch } : c)),
  });
  return (
    <div className="space-y-2">
      <p className="mb-1 block text-sm font-semibold text-ink-muted">
        Choices {multi ? '(one or more correct)' : '(one correct)'}
      </p>
      {config.choices.map((choice: any, i: number) => (
        <div key={choice.id} className="flex items-center gap-2">
          <button type="button"
            onClick={() => {
              if (multi) update(i, { isCorrect: !choice.isCorrect });
              else onChange({ choices: config.choices.map((c: any, j: number) => ({ ...c, isCorrect: j === i })) });
            }}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold ${
              choice.isCorrect ? 'bg-answer-green text-cream' : 'bg-brand-100 text-brand-700'
            }`}
            aria-pressed={choice.isCorrect}
            aria-label={`Mark choice ${i + 1} correct`}
          >✓</button>
          <Input value={choice.label} aria-label={`Choice ${i + 1}`} onChange={(e) => update(i, { label: e.target.value })} />
          <Button variant="ghost" onClick={() => remove(i)} disabled={config.choices.length <= 2}>×</Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={add} disabled={config.choices.length >= (multi ? 6 : 4)}>
        + Add choice
      </Button>
    </div>
  );
}

function PollChoicesEditor({ config, onChange }: { config: any; onChange: (patch: any) => void }) {
  return (
    <div className="space-y-2">
      <p className="mb-1 block text-sm font-semibold text-ink-muted">Poll options</p>
      {config.choices.map((choice: any, i: number) => (
        <div key={choice.id} className="flex items-center gap-2">
          <Input value={choice.label} aria-label={`Option ${i + 1}`} onChange={(e) => onChange({
            choices: config.choices.map((c: any, j: number) => (j === i ? { ...c, label: e.target.value } : c)),
          })} />
          <Button variant="ghost" onClick={() => onChange({ choices: config.choices.filter((_: any, j: number) => j !== i) })} disabled={config.choices.length <= 2}>×</Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" disabled={config.choices.length >= 4} onClick={() => onChange({
        choices: [...config.choices, { id: crypto.randomUUID(), label: 'New option' }],
      })}>+ Add option</Button>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink-muted">{label}</span>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/**
 * Optional picture for the question, by https URL only (no uploads to pay for). Shows a
 * live thumbnail once the URL is valid and the browser could load it.
 */
function ImageUrlField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [broken, setBroken] = useState(false);
  const trimmed = value.trim();
  const valid = isValidImageUrl(trimmed);
  return (
    <div>
      <label htmlFor="q-image" className="mb-1 block text-sm font-semibold text-ink-muted">
        Image (optional)
      </label>
      <div className="flex gap-2">
        <Input id="q-image" type="url" inputMode="url" value={value} aria-label="Question image URL"
          aria-invalid={!valid}
          placeholder="https://example.com/picture.jpg"
          onChange={(e) => { setBroken(false); onChange(e.target.value); }} />
        {trimmed && (
          <Button variant="ghost" aria-label="Clear image" onClick={() => { setBroken(false); onChange(''); }}>×</Button>
        )}
      </div>
      {!valid && (
        <p role="alert" className="mt-1 text-sm text-[var(--danger)]">Image links must start with https://</p>
      )}
      {valid && trimmed && (
        <div className="mt-2 flex items-center gap-3">
          {broken ? (
            <p className="text-sm text-ink-muted">Couldn't load that image. Check the link is public.</p>
          ) : (
            <img src={trimmed} alt="Question image preview" key={trimmed}
              className="max-h-32 max-w-xs rounded-tile border border-brand-200 object-contain"
              onError={() => setBroken(true)} />
          )}
        </div>
      )}
    </div>
  );
}
