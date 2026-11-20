import { useState } from 'react';
import { AnswerTile, type AnswerTileColor } from '../../components/game/AnswerTile';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { WireQuestion } from '../../shared/types';
import { choiceGridClass } from './standing';

const COLORS: AnswerTileColor[] = ['red', 'blue', 'yellow', 'green'];

/** What the player chose, in display form, for the "Answer submitted" card. */
export type PickedAnswer = { label: string; color?: AnswerTileColor; index?: number };

type Submit = (answer: unknown, picked: PickedAnswer) => void;

/**
 * Renders the answer control for each question type and hands the raw answer
 * payload to `onSubmit`, plus a display summary of it. The server evaluates and scores it.
 */
export function AnswerInput({
  question, onSubmit,
}: {
  question: WireQuestion;
  onSubmit: Submit;
}) {
  const c = question.config;
  switch (c.type) {
    case 'quiz':
    case 'poll':
      return (
        <div className={choiceGridClass(c.choices.length)}>
          {c.choices.map((choice, i) => (
            <AnswerTile key={choice.id} color={COLORS[i % 4]} label={choice.label} index={i}
              onClick={() => onSubmit(choice.id, { label: choice.label, color: COLORS[i % 4], index: i })} />
          ))}
        </div>
      );
    case 'true_false':
      return (
        <div className="grid gap-3">
          <AnswerTile color="green" label="True" index={0}
            onClick={() => onSubmit(true, { label: 'True', color: 'green', index: 0 })} />
          <AnswerTile color="red" label="False" index={1}
            onClick={() => onSubmit(false, { label: 'False', color: 'red', index: 1 })} />
        </div>
      );
    case 'multi_select':
      return <MultiSelect choices={c.choices} onSubmit={onSubmit} />;
    case 'type_answer':
      return (
        <form onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem('answer') as HTMLInputElement).value;
          if (input.trim()) onSubmit(input, { label: `“${input.trim()}”` });
        }} className="space-y-3">
          <input name="answer" autoFocus aria-label="Your answer" maxLength={200}
            className="w-full rounded-tile border-2 border-brand-200 bg-white px-4 py-3 text-lg"
            placeholder="Type your answer" />
          <Button type="submit" size="lg" className="w-full">Submit</Button>
        </form>
      );
    case 'puzzle':
      return <Puzzle items={c.items} onSubmit={onSubmit} />;
    case 'slider':
      return <Slider min={c.min} max={c.max} step={c.step} onSubmit={onSubmit} />;
    case 'scale':
      return (
        <div>
          <div className="mb-2 flex justify-between text-sm text-ink-muted">
            <span>{c.minLabel}</span><span>{c.maxLabel}</span>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: c.steps }, (_, i) => i + 1).map((n) => (
              <Button key={n} variant="secondary" className="flex-1"
                onClick={() => onSubmit(n, { label: `${n} of ${c.steps}` })}>{n}</Button>
            ))}
          </div>
        </div>
      );
    case 'drop_pin':
      return <DropPin imageUrl={c.imageUrl} onSubmit={onSubmit} />;
    case 'slide':
      return <Card className="whitespace-pre-wrap">{c.body}</Card>;
  }
}

function MultiSelect({ choices, onSubmit }: { choices: { id: string; label: string }[]; onSubmit: Submit }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Select all that apply.</p>
      <div className={choiceGridClass(choices.length)}>
        {choices.map((choice, i) => (
          <AnswerTile key={choice.id} color={COLORS[i % 4]} label={choice.label} index={i}
            selected={picked.includes(choice.id)} onClick={() => toggle(choice.id)} />
        ))}
      </div>
      <Button size="lg" className="w-full" disabled={picked.length === 0} onClick={() => onSubmit(picked, {
        label: choices.filter((ch) => picked.includes(ch.id)).map((ch) => ch.label).join(', '),
      })}>Submit</Button>
    </div>
  );
}

function Puzzle({ items, onSubmit }: { items: { id: string; label: string }[]; onSubmit: Submit }) {
  const [order, setOrder] = useState(items);
  const move = (i: number, dir: -1 | 1) => setOrder((o) => {
    const j = i + dir;
    if (j < 0 || j >= o.length) return o;
    const next = [...o];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">Put these in the right order.</p>
      {order.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2 rounded-tile bg-white p-3 shadow-tile">
          <span className="grid h-8 w-8 place-items-center rounded bg-brand-100 font-bold text-brand-700">{i + 1}</span>
          <span className="flex-1 font-semibold">{item.label}</span>
          <Button size="sm" variant="ghost" aria-label={`Move ${item.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
          <Button size="sm" variant="ghost" aria-label={`Move ${item.label} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</Button>
        </div>
      ))}
      <Button size="lg" className="w-full" onClick={() => onSubmit(order.map((o) => o.id), { label: order.map((o) => o.label).join(' → ') })}>Submit</Button>
    </div>
  );
}

function Slider({ min, max, step, onSubmit }: { min: number; max: number; step: number; onSubmit: Submit }) {
  const [value, setValue] = useState(Math.round((min + max) / 2 / step) * step);
  return (
    <div className="space-y-4">
      <p className="text-center text-4xl font-bold tabular-nums text-brand-700">{value}</p>
      <input type="range" min={min} max={max} step={step} value={value} aria-label="Your answer"
        onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-[var(--brand-700)]" />
      <div className="flex justify-between text-sm text-ink-muted"><span>{min}</span><span>{max}</span></div>
      <Button size="lg" className="w-full" onClick={() => onSubmit(value, { label: String(value) })}>Submit</Button>
    </div>
  );
}

function DropPin({ imageUrl, onSubmit }: { imageUrl: string; onSubmit: Submit }) {
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Tap the image to drop your pin.</p>
      <div className="relative">
        <img src={imageUrl} alt="Drop your pin on this image" className="w-full cursor-crosshair rounded"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPin({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
          }} />
        {pin && (
          <div className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--danger)] ring-2 ring-white"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }} />
        )}
      </div>
      <Button size="lg" className="w-full" disabled={!pin} onClick={() => onSubmit(pin, { label: 'Your pin on the image' })}>Submit</Button>
    </div>
  );
}
