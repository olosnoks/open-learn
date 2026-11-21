import { Card } from '../../components/ui/Card';
import { AnswerTile, answerColor } from '../../components/game/AnswerTile';
import { cn } from '../../lib/cn';
import type { CorrectAnswer, PersonalStanding, WireQuestion } from '../../shared/types';
import { gapLine, rankLine, teamLine } from './standing';
import { useCountUp } from './useCountUp';

/** Result of the last question. Rendered inside PlayerGame's PlayerShell. */
export function PlayerFeedback({
  question, correct, correctAnswer, answered, pointsAwarded, score, streak, team, standing, showAnswers = true,
}: {
  question: WireQuestion;
  correct: boolean;
  correctAnswer: CorrectAnswer;
  answered: boolean;
  pointsAwarded: number;
  score: number;
  streak: number;
  team: { name: string; color: string; score: number } | null;
  standing: PersonalStanding | null;
  /** Room setting showAnswersOnDevices; when false the correct choice is shown as a shape only. */
  showAnswers?: boolean;
}) {
  // Polls, slides, scales and sliders without a target have no right answer.
  const ungraded = correctAnswer.type === 'none';
  const tone = ungraded ? 'neutral' : correct ? 'good' : 'bad';
  const headline = ungraded
    ? (answered ? 'Thanks for answering' : 'Moving on')
    : !answered ? "Time's up" : correct ? 'Correct!' : 'Not quite';
  const showPoints = correct && pointsAwarded > 0;
  const shownPoints = useCountUp(showPoints ? pointsAwarded : 0);
  const shownScore = useCountUp(score, showPoints ? Math.max(0, score - pointsAwarded) : score);
  const gap = standing ? gapLine(standing) : null;

  return (
    <>
      <Card className={cn(
        'text-center motion-safe:animate-pop-in',
        tone === 'good' ? 'ring-4 ring-[var(--success)]' : tone === 'bad' ? 'ring-4 ring-[var(--danger)]' : 'ring-2 ring-brand-200',
      )}>
        <div className={cn(
          'mx-auto grid h-20 w-20 place-items-center rounded-full',
          tone === 'good' ? 'bg-[var(--success)] text-white' : tone === 'bad' ? 'bg-[var(--danger)] text-white' : 'bg-brand-100 text-brand-700',
        )} aria-hidden="true">
          {tone === 'good' && (
            <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
          )}
          {tone === 'bad' && (
            <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          )}
          {tone === 'neutral' && (
            <svg viewBox="0 0 24 24" className="h-11 w-11 fill-current"><circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" /></svg>
          )}
        </div>
        <p aria-live="polite" className={cn(
          'mt-4 font-display text-3xl font-bold',
          tone === 'good' ? 'text-[var(--success)]' : tone === 'bad' ? 'text-[var(--danger)]' : 'text-brand-700',
        )}>
          {headline}
        </p>
        {showPoints && (
          <p className="mt-1 font-display text-5xl font-bold text-brand-700">
            <span aria-hidden="true" className="tabular-nums">+{shownPoints}</span>
            <span className="sr-only">+{pointsAwarded} points</span>
          </p>
        )}
        {streak >= 2 && (
          <p className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-answer-yellow px-3 py-1 text-sm font-bold text-ink motion-safe:animate-pop-in">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                <path d="M8 1c.5 2.5 3.5 4 3.5 7.5A3.5 3.5 0 0 1 8 12a3.5 3.5 0 0 1-3.5-3.5c0-1.4.6-2.4 1.3-3.2.1 1.1.7 1.9 1.5 2.2C7 5.5 7.4 3 8 1Z" />
                <path d="M3 10.5A5 5 0 0 0 13 10.5c0 2.8-2.2 4.5-5 4.5s-5-1.7-5-4.5Z" opacity=".55" />
              </svg>
              {streak} in a row
            </span>
          </p>
        )}
        <p className="mt-4 text-sm text-ink-muted">
          Your score{' '}
          <span aria-hidden="true" className="font-semibold tabular-nums text-ink">{shownScore}</span>
          <span className="sr-only">{score}</span>
        </p>
      </Card>
      {standing && (
        <Card className="mt-3 text-center motion-safe:animate-fade-up" data-testid="your-standing" style={{ animationDelay: '120ms' }}>
          <p className="font-display text-2xl font-bold text-brand-700">{rankLine(standing)}</p>
          {gap && <p className="mt-1 text-ink-muted">{gap}</p>}
        </Card>
      )}
      {team && (
        <Card className="mt-3 motion-safe:animate-fade-up" style={{ borderLeft: `6px solid ${team.color}`, animationDelay: '200ms' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Team {team.name}</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{standing?.team?.score ?? team.score} pts</p>
          {standing?.team && <p className="mt-1 text-sm text-ink-muted">{teamLine(standing.team)}</p>}
        </Card>
      )}
      <CorrectAnswerReveal answer={correctAnswer} question={question} showAnswers={showAnswers} />
      <p className="mt-6 text-center text-sm text-ink-muted">Waiting for the host…</p>
    </>
  );
}

function CorrectAnswerReveal({ answer, question, showAnswers }: { answer: CorrectAnswer; question: WireQuestion; showAnswers: boolean }) {
  if (answer.type === 'none') return null;
  const cfg = question.config;

  if (answer.type === 'choice' && cfg.type === 'true_false') {
    const isTrue = answer.ids[0] === 'true';
    return (
      <RevealFrame>
        <AnswerTile readOnly state="correct" color={isTrue ? 'green' : 'red'} label={isTrue ? 'True' : 'False'} index={isTrue ? 0 : 1} />
      </RevealFrame>
    );
  }
  if (answer.type === 'choice' && (cfg.type === 'quiz' || cfg.type === 'multi_select' || cfg.type === 'poll')) {
    const correctChoices = cfg.choices.map((c, i) => ({ ...c, i })).filter((c) => answer.ids.includes(c.id));
    return (
      <RevealFrame>
        <div className="grid gap-2">
          {correctChoices.map((c) => (
            <AnswerTile key={c.id} readOnly state="correct" color={answerColor(c.i)} label={c.label} index={c.i}
              hideLabel={!showAnswers} className="min-h-[64px]" />
          ))}
        </div>
      </RevealFrame>
    );
  }

  let body = '';
  if (answer.type === 'text') body = answer.accepted.join(' / ');
  else if (answer.type === 'puzzle') {
    body = answer.order.map((id) => {
      if (cfg.type !== 'puzzle') return id;
      return cfg.items.find((i) => i.id === id)?.label ?? id;
    }).join(' → ');
  } else if (answer.type === 'number') body = `${answer.value} ± ${answer.tolerance}`;
  else if (answer.type === 'pin') body = `Pinned at (${(answer.x * 100).toFixed(0)}%, ${(answer.y * 100).toFixed(0)}%)`;

  return (
    <RevealFrame>
      <p className="text-lg font-semibold [overflow-wrap:anywhere]">{body}</p>
    </RevealFrame>
  );
}

function RevealFrame({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-4 bg-brand-50 motion-safe:animate-fade-up" style={{ animationDelay: '280ms' }}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-500">Correct answer</p>
      {children}
    </Card>
  );
}
