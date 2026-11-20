import { Card } from '../../components/ui/Card';
import type { CorrectAnswer, PersonalStanding, WireQuestion } from '../../shared/types';
import { gapLine, rankLine, teamLine } from './standing';
import { useCountUp } from './useCountUp';

/** Result of the last question. Rendered inside PlayerGame's PlayerShell. */
export function PlayerFeedback({
  question, correct, correctAnswer, answered, pointsAwarded, score, streak, team, standing,
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
}) {
  // Polls, slides, scales and sliders without a target have no right answer.
  const ungraded = correctAnswer.type === 'none';
  const tone = ungraded ? 'neutral' : correct ? 'good' : 'bad';
  const headline = ungraded
    ? (answered ? 'Thanks for answering' : 'Moving on')
    : !answered ? "Time's up" : correct ? '✓ Correct' : '✗ Not quite';
  const showPoints = correct && pointsAwarded > 0;
  const shownPoints = useCountUp(showPoints ? pointsAwarded : 0);
  const shownScore = useCountUp(score, showPoints ? Math.max(0, score - pointsAwarded) : score);
  const gap = standing ? gapLine(standing) : null;

  return (
    <>
      <Card className={
        tone === 'good' ? 'border-2 border-[var(--success)]'
          : tone === 'bad' ? 'border-2 border-[var(--danger)]'
          : 'border-2 border-brand-200'
      }>
        <div className="text-center">
          <p aria-live="polite" className={`text-3xl font-bold ${
            tone === 'good' ? 'text-[var(--success)]' : tone === 'bad' ? 'text-[var(--danger)]' : 'text-brand-700'
          }`}>
            {headline}
          </p>
          {showPoints && (
            <p className="mt-2 text-xl font-semibold text-brand-700">
              <span aria-hidden="true" className="tabular-nums">+{shownPoints} points</span>
              <span className="sr-only">+{pointsAwarded} points</span>
            </p>
          )}
          {streak >= 2 && (
            <p className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-answer-yellow px-3 py-1 text-sm font-bold text-ink">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                  <path d="M8 1c.5 2.5 3.5 4 3.5 7.5A3.5 3.5 0 0 1 8 12a3.5 3.5 0 0 1-3.5-3.5c0-1.4.6-2.4 1.3-3.2.1 1.1.7 1.9 1.5 2.2C7 5.5 7.4 3 8 1Z" />
                  <path d="M3 10.5A5 5 0 0 0 13 10.5c0 2.8-2.2 4.5-5 4.5s-5-1.7-5-4.5Z" opacity=".55" />
                </svg>
                {streak} in a row
              </span>
            </p>
          )}
          <p className="mt-3 text-sm text-ink-muted">
            Your score{' '}
            <span aria-hidden="true" className="font-semibold tabular-nums text-ink">{shownScore}</span>
            <span className="sr-only">{score}</span>
          </p>
        </div>
      </Card>
      {standing && (
        <Card className="mt-3 text-center" data-testid="your-standing">
          <p className="text-2xl font-bold text-brand-700">{rankLine(standing)}</p>
          {gap && <p className="mt-1 text-ink-muted">{gap}</p>}
        </Card>
      )}
      {team && (
        <Card className="mt-3" style={{ borderLeft: `6px solid ${team.color}` }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Team {team.name}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{standing?.team?.score ?? team.score} pts</p>
          {standing?.team && <p className="mt-1 text-sm text-ink-muted">{teamLine(standing.team)}</p>}
        </Card>
      )}
      <CorrectAnswerReveal answer={correctAnswer} question={question} />
      <p className="mt-6 text-center text-sm text-ink-muted">Waiting for the host…</p>
    </>
  );
}

function CorrectAnswerReveal({ answer, question }: { answer: CorrectAnswer; question: WireQuestion }) {
  if (answer.type === 'none') return null;
  let body = '';
  if (answer.type === 'choice') {
    if (question.config.type === 'true_false') body = answer.ids[0] === 'true' ? 'True' : 'False';
    else if (question.config.type === 'quiz' || question.config.type === 'multi_select' || question.config.type === 'poll') {
      body = question.config.choices.filter((c) => answer.ids.includes(c.id)).map((c) => c.label).join(', ');
    }
  } else if (answer.type === 'text') body = answer.accepted.join(' / ');
  else if (answer.type === 'puzzle') {
    body = answer.order.map((id) => {
      if (question.config.type !== 'puzzle') return id;
      return question.config.items.find((i) => i.id === id)?.label ?? id;
    }).join(' → ');
  } else if (answer.type === 'number') body = `${answer.value} ± ${answer.tolerance}`;
  else if (answer.type === 'pin') body = `Pinned at (${(answer.x * 100).toFixed(0)}%, ${(answer.y * 100).toFixed(0)}%)`;

  return (
    <Card className="mt-4 bg-brand-50 text-ink">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Correct answer</p>
      <p className="mt-1 text-lg font-semibold">{body}</p>
    </Card>
  );
}
