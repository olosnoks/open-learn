import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { AnswerTile, type AnswerTileColor } from '../../components/game/AnswerTile';
import { CountdownRing } from '../../components/game/CountdownRing';
import { Leaderboard } from '../../components/game/Leaderboard';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { useNow } from '../../lib/useNow';
import type {
  CorrectAnswer, GamePhase, ServerEvent, Standings, WireQuestion,
} from '../../shared/types';

const COLORS: AnswerTileColor[] = ['red', 'blue', 'yellow', 'green'];

export function HostGame({ hostToken }: { hostToken: string }) {
  const { sessionId = '', code = '' } = useParams<{ sessionId: string; code: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [total, setTotal] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [reveal, setReveal] = useState<CorrectAnswer | null>(null);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [standings, setStandings] = useState<Standings | null>(null);
  const [finalPodium, setFinalPodium] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useNow(phase === 'question' && pausedRemaining === null) + serverOffset;
  const remainingMs = pausedRemaining ?? Math.max(0, endsAt - now);

  const { send } = useRoomSocket(code, (event: ServerEvent) => {
    switch (event.type) {
      case 'WELCOME': {
        const s = event.snapshot;
        setTotal(s.total);
        setServerOffset(s.serverTime - Date.now());
        if (s.question) setQuestion(s.question);
        if (s.endsAt) setEndsAt(s.endsAt);
        setAnswerCount(s.answerCount ?? 0);
        setPausedRemaining(s.paused && s.endsAt ? Math.max(0, s.endsAt - s.serverTime) : null);
        setPhase(s.phase);
        if (s.phase === 'lobby') navigate(`/host/${sessionId}/${code}`, { replace: true });
        break;
      }
      case 'QUESTION_STARTED':
        setQuestion(event.question);
        setTotal(event.total);
        setEndsAt(event.endsAt);
        setServerOffset(event.serverTime - Date.now());
        setPausedRemaining(null);
        setAnswerCount(0); setReveal(null); setDistribution({}); setPhase('question');
        break;
      case 'ANSWER_COUNT': setAnswerCount(event.count); break;
      case 'PAUSED': setPausedRemaining(Math.max(0, endsAt - (Date.now() + serverOffset))); break;
      case 'RESUMED': setEndsAt(event.endsAt); setPausedRemaining(null); break;
      case 'QUESTION_REVEALED':
        setReveal(event.correct); setDistribution(event.distribution);
        setStandings(event.standings); setPhase('reveal'); setPausedRemaining(null);
        break;
      case 'GAME_FINISHED': setFinalPodium(event.podium); setPhase('finished'); break;
      case 'ERROR': setError(event.message); break;
    }
  }, (reason) => setError(reason));

  if (phase === 'finished') {
    return (
      <HostShell nav={false}>
        <h1 className="text-center text-4xl font-bold">Final podium</h1>
        <div className="mx-auto mt-8 w-full max-w-md">
          {finalPodium ? <Leaderboard standings={finalPodium} /> : <p className="text-center">Game over.</p>}
        </div>
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={() => navigate(`/sessions/${sessionId}`)}>View full results</Button>
        </div>
      </HostShell>
    );
  }

  if (!question) {
    return <HostShell nav={false}>{error ? <p role="alert">{error}</p> : 'Loading question…'}</HostShell>;
  }

  const countFor = (key: unknown) => distribution[JSON.stringify(key)] ?? 0;
  const hasChoices = question.config.type === 'quiz' || question.config.type === 'multi_select' || question.config.type === 'poll';

  return (
    <HostShell nav={false}>
      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-semibold">Q{question.index + 1}{total ? ` / ${total}` : ''}</span>
        {phase === 'question' && (
          <CountdownRing remaining={remainingMs / 1000} total={question.timeLimitSec} />
        )}
        <span className="text-lg font-semibold">{answerCount} answered</span>
      </div>
      <h1 className="mb-8 text-center text-4xl font-bold">{question.prompt}</h1>
      {pausedRemaining !== null && phase === 'question' && (
        <p className="mb-4 text-center text-xl font-semibold text-brand-200">Paused</p>
      )}

      {question.config.type === 'slide' && (
        <Card className="mx-auto max-w-3xl whitespace-pre-wrap bg-cream text-lg text-ink">{question.config.body}</Card>
      )}

      {hasChoices && 'choices' in question.config && (
        <div className="grid grid-cols-2 gap-4">
          {question.config.choices.map((choice, i) => (
            <div key={choice.id} className="relative">
              <AnswerTile color={COLORS[i % 4]} label={choice.label} index={i} disabled
                selected={reveal?.type === 'choice' && reveal.ids.includes(choice.id)} />
              {phase === 'reveal' && question.config.type !== 'multi_select' && (
                <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 text-sm font-bold text-cream">
                  {countFor(choice.id)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {question.config.type === 'true_false' && (
        <div className="grid grid-cols-2 gap-4">
          {[true, false].map((v, i) => (
            <div key={String(v)} className="relative">
              <AnswerTile color={v ? 'green' : 'red'} label={v ? 'True' : 'False'} index={i} disabled
                selected={reveal?.type === 'choice' && reveal.ids.includes(String(v))} />
              {phase === 'reveal' && (
                <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 text-sm font-bold text-cream">
                  {countFor(v)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'reveal' && reveal && !hasChoices && question.config.type !== 'true_false' && reveal.type !== 'none' && (
        <Card className="mx-auto max-w-xl bg-cream text-center text-ink">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Correct answer</p>
          <p className="mt-1 text-2xl font-bold">
            {reveal.type === 'text' && reveal.accepted.join(' / ')}
            {reveal.type === 'number' && `${reveal.value} ± ${reveal.tolerance}`}
            {reveal.type === 'pin' && `(${Math.round(reveal.x * 100)}%, ${Math.round(reveal.y * 100)}%)`}
            {reveal.type === 'puzzle' && question.config.type === 'puzzle' &&
              reveal.order.map((id) => (question.config.type === 'puzzle'
                ? question.config.items.find((it) => it.id === id)?.label ?? id : id)).join(' → ')}
          </p>
        </Card>
      )}

      {phase === 'reveal' && standings && <div className="mx-auto mt-8 w-full max-w-xl"><Leaderboard standings={standings} /></div>}
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-auto flex justify-center gap-4 pt-8">
        {phase === 'question' && (
          <>
            {pausedRemaining === null
              ? <Button variant="secondary" onClick={() => send({ type: 'HOST_PAUSE', hostToken })}>Pause</Button>
              : <Button variant="secondary" onClick={() => send({ type: 'HOST_RESUME', hostToken })}>Resume</Button>}
            <Button variant="secondary" onClick={() => send({ type: 'HOST_SKIP', hostToken })}>Reveal now</Button>
          </>
        )}
        {phase === 'reveal' && (
          <Button variant="secondary" onClick={() => send({ type: 'HOST_NEXT', hostToken })}>
            {question.index + 1 >= total ? 'Finish' : 'Next'}
          </Button>
        )}
        <Button variant="ghost" onClick={() => { if (confirm('End the game for everyone?')) send({ type: 'HOST_END', hostToken }); }}>
          End game
        </Button>
      </div>
    </HostShell>
  );
}
