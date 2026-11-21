import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { AnswerTile, answerColor, type TileState } from '../../components/game/AnswerTile';
import { AnswerDistribution, type DistributionItem } from '../../components/game/AnswerDistribution';
import { CountdownRing } from '../../components/game/CountdownRing';
import { Leaderboard } from '../../components/game/Leaderboard';
import { Podium } from '../../components/game/Podium';
import { QuestionImage } from '../../components/game/QuestionImage';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { useNow } from '../../lib/useNow';
import type {
  CorrectAnswer, GamePhase, RoomSettings, ServerEvent, Standings, WireQuestion,
} from '../../shared/types';

type Stage = 'answers' | 'scoreboard';

const isChoice = (q: WireQuestion) =>
  q.config.type === 'quiz' || q.config.type === 'multi_select' || q.config.type === 'poll';

/** The room keys `distribution` by the JSON-encoded answer payload. */
function parseKey(key: string): unknown {
  try { return JSON.parse(key); } catch { return key; }
}

export function HostGame({ hostToken }: { hostToken: string }) {
  const { sessionId = '', code = '' } = useParams<{ sessionId: string; code: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [stage, setStage] = useState<Stage>('answers');
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [total, setTotal] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [reveal, setReveal] = useState<CorrectAnswer | null>(null);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [standings, setStandings] = useState<Standings | null>(null);
  const [finalPodium, setFinalPodium] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useNow(phase === 'question' && pausedRemaining === null) + serverOffset;
  const remainingMs = pausedRemaining ?? Math.max(0, endsAt - now);
  const paused = pausedRemaining !== null && phase === 'question';

  const { send } = useRoomSocket(code, (event: ServerEvent) => {
    switch (event.type) {
      case 'WELCOME': {
        const s = event.snapshot;
        setTotal(s.total);
        setSettings(s.settings ?? null);
        setPlayerCount(event.players.filter((p) => p.connected).length);
        setServerOffset(s.serverTime - Date.now());
        if (s.question) setQuestion(s.question);
        if (s.endsAt) setEndsAt(s.endsAt);
        setAnswerCount(s.answerCount ?? 0);
        setPausedRemaining(s.paused && s.endsAt ? Math.max(0, s.endsAt - s.serverTime) : null);
        setPhase(s.phase);
        if (s.phase === 'lobby') navigate(`/host/${sessionId}/${code}`, { replace: true });
        if (s.phase === 'finished') navigate(`/sessions/${sessionId}`, { replace: true });
        break;
      }
      case 'LOBBY_UPDATE': setPlayerCount(event.players.filter((p) => p.connected).length); break;
      case 'QUESTION_STARTED':
        setQuestion(event.question);
        setTotal(event.total);
        setEndsAt(event.endsAt);
        setServerOffset(event.serverTime - Date.now());
        setPausedRemaining(null);
        setAnswerCount(0); setReveal(null); setDistribution({}); setStage('answers'); setPhase('question');
        break;
      case 'ANSWER_COUNT': setAnswerCount(event.count); break;
      case 'PAUSED': setPausedRemaining(Math.max(0, endsAt - (Date.now() + serverOffset))); break;
      case 'RESUMED': setEndsAt(event.endsAt); setPausedRemaining(null); break;
      case 'QUESTION_REVEALED':
        setReveal(event.correct); setDistribution(event.distribution);
        setStandings(event.standings); setStage('answers'); setPhase('reveal'); setPausedRemaining(null);
        break;
      case 'GAME_FINISHED': setFinalPodium(event.podium); setPhase('finished'); break;
      case 'ERROR': setError(event.message); break;
    }
  }, (reason) => setError(reason));

  const endGame = () => { if (confirm('End the game for everyone?')) send({ type: 'HOST_END', hostToken }); };

  if (phase === 'finished') {
    return (
      <HostShell nav={false} wide>
        <header className="mb-8 text-center motion-safe:animate-fade-up">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Game over</p>
          <h1 className="mt-1 font-display text-4xl font-bold md:text-6xl">Final podium</h1>
        </header>
        {finalPodium && finalPodium.rows.length > 0
          ? <Podium standings={finalPodium} />
          : <p className="text-center text-xl">Nobody scored this time.</p>}
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button size="lg" variant="secondary" onClick={() => navigate(`/sessions/${sessionId}`)}>View full results</Button>
          <Button size="lg" variant="ghost" onClick={() => navigate('/host/create')}>Host another game</Button>
        </div>
      </HostShell>
    );
  }

  if (!question) {
    return (
      <HostShell nav={false} wide>
        <p role={error ? 'alert' : 'status'} className="m-auto text-center text-xl">{error ?? 'Loading question…'}</p>
      </HostShell>
    );
  }

  const cfg = question.config;
  const correctIds = reveal?.type === 'choice' ? reveal.ids : null;
  const countFor = (key: unknown) => distribution[JSON.stringify(key)] ?? 0;
  // multi_select answers are arrays of ids: count each id across every submitted set.
  const multiCountFor = (id: string) => Object.entries(distribution).reduce((sum, [k, c]) => {
    const parsed = parseKey(k);
    return Array.isArray(parsed) && parsed.includes(id) ? sum + c : sum;
  }, 0);

  let items: DistributionItem[] | null = null;
  if (isChoice(question) && 'choices' in cfg) {
    items = cfg.choices.map((ch, i) => ({
      key: ch.id, label: ch.label, color: answerColor(i),
      count: cfg.type === 'multi_select' ? multiCountFor(ch.id) : countFor(ch.id),
      correct: cfg.type === 'poll' ? null : correctIds ? correctIds.includes(ch.id) : null,
    }));
  } else if (cfg.type === 'true_false') {
    items = [
      { key: 'true', label: 'True', color: 'green', count: countFor(true), correct: correctIds ? correctIds.includes('true') : null },
      { key: 'false', label: 'False', color: 'red', count: countFor(false), correct: correctIds ? correctIds.includes('false') : null },
    ];
  }

  const tileState = (key: string): TileState => {
    if (phase !== 'reveal' || !correctIds) return 'idle';
    return correctIds.includes(key) ? 'correct' : 'dim';
  };
  const countBadge = (n: number) => phase === 'reveal'
    ? <span className="rounded-full bg-black/30 px-3 py-1 text-base font-bold tabular-nums text-white lg:text-lg">{n}</span>
    : undefined;

  // Free-form answers (typed, slider, puzzle, pin, scale): the most common submissions.
  const freeform = !items && phase === 'reveal'
    ? Object.entries(distribution).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => ({ key: k, count: c, label: formatAnswer(parseKey(k), question) }))
    : [];

  const isLast = question.index + 1 >= total;

  return (
    <HostShell nav={false} wide>
      <header className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cream/10 px-4 py-2 text-lg font-semibold ring-1 ring-cream/20">
            Question {question.index + 1}<span className="text-brand-200">{total ? ` / ${total}` : ''}</span>
          </span>
          {settings?.autoAdvance && (
            <span title="Auto-advance is on: the room moves on by itself"
              className="rounded-full bg-brand-300/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-200 ring-1 ring-brand-300/40">
              Auto
            </span>
          )}
          {paused && (
            <span role="status" className="rounded-full bg-answer-yellow px-3 py-1 text-xs font-bold uppercase tracking-widest text-ink">
              Paused
            </span>
          )}
        </div>
        <div className="justify-self-center">
          {phase === 'question' ? (
            <CountdownRing size="lg" remaining={remainingMs / 1000} total={question.timeLimitSec} />
          ) : (
            <div aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-cream text-brand-700 shadow-card motion-safe:animate-pop-in">
              <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
            </div>
          )}
        </div>
        <p className="justify-self-end rounded-full bg-cream/10 px-4 py-2 text-right text-lg font-semibold ring-1 ring-cream/20" aria-live="polite">
          <span className="font-display text-3xl font-bold tabular-nums">{answerCount}</span>
          {playerCount ? <span className="text-brand-200"> / {playerCount}</span> : null} answered
        </p>
      </header>

      <h1 className={cn(
        'mx-auto mb-5 max-w-5xl text-balance text-center font-display font-bold leading-tight [overflow-wrap:anywhere] motion-safe:animate-fade-up',
        phase === 'reveal' ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-3xl md:text-4xl lg:text-5xl',
      )}>
        {question.prompt}
      </h1>
      {/* The picture had its moment during the question; drop it on reveal so the chart fits a 720p projector. */}
      {phase === 'question' && <QuestionImage src={question.imageUrl} alt="" variant="host" className="mb-6" />}

      {cfg.type === 'slide' && (
        <Card className="mx-auto w-full max-w-4xl whitespace-pre-wrap bg-cream text-xl leading-relaxed text-ink md:text-2xl">{cfg.body}</Card>
      )}

      {stage === 'answers' && items && (
        <div className={cn(
          'grid',
          phase === 'reveal' ? 'gap-3' : 'gap-4',
          items.length === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2',
          phase === 'reveal' && items.length > 4 && 'lg:grid-cols-3',
        )}>
          {items.map((it, i) => (
            <AnswerTile key={it.key} readOnly size={phase === 'reveal' ? 'md' : 'lg'} color={it.color} label={it.label} index={i}
              state={tileState(it.key)} badge={countBadge(it.count)} className={phase === 'reveal' ? 'min-h-[72px] text-xl' : undefined} />
          ))}
        </div>
      )}

      {phase === 'question' && !items && cfg.type !== 'slide' && (
        <Card className="mx-auto w-full max-w-xl bg-cream text-center text-ink">
          <p className="flex items-center justify-center gap-2 text-xl font-semibold">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-brand-500 motion-safe:animate-shimmer" />
            Players are answering on their phones
          </p>
        </Card>
      )}

      {phase === 'reveal' && stage === 'answers' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[3fr_2fr] lg:items-start">
          <div>
            {items && <AnswerDistribution items={items} />}
            {!items && reveal && reveal.type !== 'none' && (
              <Card className="mx-auto w-full max-w-xl bg-cream text-center text-ink motion-safe:animate-pop-in">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Correct answer</p>
                <p className="mt-1 font-display text-3xl font-bold [overflow-wrap:anywhere]">{formatCorrect(reveal, question)}</p>
              </Card>
            )}
            {freeform.length > 0 && (
              <Card className="mx-auto mt-4 w-full max-w-xl bg-cream text-ink">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-500">What players answered</p>
                <ol className="space-y-1">
                  {freeform.map((f) => (
                    <li key={f.key} className="flex items-center justify-between gap-3 text-lg font-semibold">
                      <span className="min-w-0 truncate">{f.label}</span>
                      <span className="shrink-0 rounded-full bg-brand-100 px-3 py-0.5 tabular-nums text-brand-800">{f.count}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
          {standings && <Leaderboard standings={standings} limit={5} />}
        </div>
      )}

      {phase === 'reveal' && stage === 'scoreboard' && standings && (
        <div className="mx-auto mt-2 w-full max-w-3xl motion-safe:animate-fade-up">
          <Leaderboard standings={standings} limit={8} size="lg" />
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}

      <footer className="mt-auto flex flex-wrap items-center justify-center gap-3 pt-8 md:gap-4">
        {phase === 'question' && (
          <>
            {pausedRemaining === null
              ? <Button size="lg" variant="secondary" onClick={() => send({ type: 'HOST_PAUSE', hostToken })}>Pause</Button>
              : <Button size="lg" variant="secondary" onClick={() => send({ type: 'HOST_RESUME', hostToken })}>Resume</Button>}
            <Button size="lg" variant="secondary" onClick={() => send({ type: 'HOST_SKIP', hostToken })}>Reveal now</Button>
          </>
        )}
        {phase === 'reveal' && stage === 'answers' && (
          <>
            <Button size="lg" variant="secondary" onClick={() => setStage('scoreboard')}>Scoreboard</Button>
            <Button size="lg" variant="ghost" onClick={() => send({ type: 'HOST_NEXT', hostToken })}>
              {isLast ? 'Finish' : 'Skip to next'}
            </Button>
          </>
        )}
        {phase === 'reveal' && stage === 'scoreboard' && (
          <>
            <Button size="lg" variant="ghost" onClick={() => setStage('answers')}>Back to answers</Button>
            <Button size="lg" variant="secondary" onClick={() => send({ type: 'HOST_NEXT', hostToken })}>
              {isLast ? 'Finish' : 'Next question'}
            </Button>
          </>
        )}
        <Button size="lg" variant="ghost" onClick={endGame}>End game</Button>
      </footer>
    </HostShell>
  );
}

function formatCorrect(reveal: CorrectAnswer, question: WireQuestion): string {
  const cfg = question.config;
  switch (reveal.type) {
    case 'text': return reveal.accepted.join(' / ');
    case 'number': return `${reveal.value} ± ${reveal.tolerance}`;
    case 'pin': return `(${Math.round(reveal.x * 100)}%, ${Math.round(reveal.y * 100)}%)`;
    case 'puzzle':
      return reveal.order.map((id) => (cfg.type === 'puzzle' ? cfg.items.find((it) => it.id === id)?.label ?? id : id)).join(' → ');
    case 'choice': return reveal.ids.join(', ');
    case 'none': return '';
  }
}

function formatAnswer(value: unknown, question: WireQuestion): string {
  const cfg = question.config;
  if (Array.isArray(value)) {
    if (cfg.type === 'puzzle') return value.map((id) => cfg.items.find((it) => it.id === id)?.label ?? String(id)).join(' → ');
    return value.map(String).join(', ');
  }
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    const p = value as { x: number; y: number };
    return `(${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%)`;
  }
  if (typeof value === 'string') return `“${value}”`;
  return String(value);
}
