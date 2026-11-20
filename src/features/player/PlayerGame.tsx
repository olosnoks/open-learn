import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlayerShell } from '../../components/layout/PlayerShell';
import { CountdownRing } from '../../components/game/CountdownRing';
import { Leaderboard } from '../../components/game/Leaderboard';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import { PlayerFeedback } from './PlayerFeedback';
import { AnswerInput, type PickedAnswer } from './AnswerInput';
import { gapLine, rankLine, teamLine } from './standing';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { useNow } from '../../lib/useNow';
import { clearPlayerIdentity, getPlayerIdentity } from '../../lib/storage';
import type {
  CorrectAnswer, GamePhase, PersonalStanding, PlayerRow, ServerEvent, Standings,
  TeamWithMembers, WireQuestion,
} from '../../shared/types';

const PICK_STYLES = {
  red: 'bg-answer-red text-cream',
  blue: 'bg-answer-blue text-cream',
  yellow: 'bg-answer-yellow text-ink',
  green: 'bg-answer-green text-cream',
} as const;

type Me = { nickname: string | null; team: { id: string; name: string; color: string } | null };

export function PlayerGame() {
  const { code = '' } = useParams<{ code: string }>();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [picked, setPicked] = useState<PickedAnswer | null>(null);
  const [reveal, setReveal] = useState<CorrectAnswer | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(false);
  const [lastPoints, setLastPoints] = useState(0);
  const [teamInfo, setTeamInfo] = useState<{ name: string; color: string; score: number } | null>(null);
  const [standing, setStanding] = useState<PersonalStanding | null>(null);
  const [podium, setPodium] = useState<Standings | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  // Start from what JoinScreen saved (older saved identities lack these), then confirm from the server's lists.
  const [me, setMe] = useState<Me>(() => {
    const id = getPlayerIdentity();
    return id && id.roomCode === code
      ? { nickname: id.nickname ?? null, team: id.team ?? null }
      : { nickname: null, team: null };
  });
  const playerIdRef = useRef<string | null>(getPlayerIdentity()?.playerId ?? null);
  const everOpenRef = useRef(false);

  const now = useNow(phase === 'question' && !paused) + serverOffset;

  const syncMe = (players: PlayerRow[], teams: TeamWithMembers[]) => {
    setPlayerCount(players.length);
    const self = players.find((p) => p.id === playerIdRef.current);
    if (!self) return;
    const team = teams.find((t) => t.id === self.teamId);
    setMe({
      nickname: self.nickname,
      team: team ? { id: team.id, name: team.name, color: team.color } : null,
    });
  };

  const { send, status } = useRoomSocket(code, (event: ServerEvent) => {
    switch (event.type) {
      case 'WELCOME': {
        // Every (re)connection is a fresh socket: re-bind it to our player identity.
        const identity = getPlayerIdentity();
        if (identity && identity.roomCode === code) {
          playerIdRef.current = identity.playerId;
          syncMe(event.players, event.teams);
          send({ type: 'RECONNECT', playerId: identity.playerId });
        } else setFatal('You have not joined this game.');
        break;
      }
      case 'LOBBY_UPDATE':
        syncMe(event.players, event.teams);
        break;
      case 'RECONNECTED': {
        const s = event.snapshot;
        setScore(event.score); setStreak(event.streak);
        setServerOffset(s.serverTime - Date.now());
        setPaused(Boolean(s.paused));
        if (s.question) setQuestion(s.question);
        if (s.endsAt) setEndsAt(s.endsAt);
        setPhase(s.phase);
        break;
      }
      case 'QUESTION_STARTED':
        setQuestion(event.question);
        setEndsAt(event.endsAt);
        setServerOffset(event.serverTime - Date.now());
        setSubmitted(false); setPicked(null); setReveal(null); setCorrect(false); setLastPoints(0);
        setStanding(null);
        setPaused(false); setError(null);
        setPhase('question');
        break;
      case 'ANSWER_ACK':
        if (event.accepted) setSubmitted(true);
        else if (event.reason === 'duplicate') setSubmitted(true);
        else {
          setPicked(null);
          if (event.reason) setError(`Answer not accepted (${event.reason})`);
        }
        break;
      case 'PLAYER_RESULT':
        setScore(event.score); setStreak(event.streak);
        setCorrect(event.correct); setLastPoints(event.pointsAwarded);
        if (event.teamName && event.teamColor !== undefined && event.teamScore !== undefined) {
          setTeamInfo({ name: event.teamName, color: event.teamColor, score: event.teamScore });
        }
        break;
      case 'PAUSED': setPaused(true); break;
      case 'RESUMED': setPaused(false); setEndsAt(event.endsAt); break;
      case 'QUESTION_REVEALED':
        setReveal(event.correct); setPhase('reveal');
        break;
      case 'YOUR_STANDING': {
        const rest: PersonalStanding = {
          rank: event.rank, totalPlayers: event.totalPlayers, score: event.score,
          behind: event.behind, team: event.team,
        };
        setStanding(rest);
        setScore(rest.score);
        if (rest.team) {
          const t = rest.team;
          setTeamInfo({ name: t.name, color: t.color, score: t.score });
          setMe((m) => ({ ...m, team: { id: t.id, name: t.name, color: t.color } }));
        }
        break;
      }
      case 'GAME_FINISHED':
        setPodium(event.podium);
        setPhase('finished');
        clearPlayerIdentity();
        break;
      case 'PLAYER_KICKED': {
        if (playerIdRef.current === event.playerId) {
          clearPlayerIdentity();
          setFatal('You were removed by the host.');
        }
        break;
      }
      case 'ERROR':
        if (event.code === 'UNKNOWN_PLAYER') { clearPlayerIdentity(); setFatal('This game no longer has your seat.'); }
        else setError(event.message);
        break;
    }
  }, (reason) => setFatal(reason));

  if (status === 'open') everOpenRef.current = true;
  const reconnecting = everOpenRef.current && (status === 'connecting' || status === 'closed')
    && phase !== 'finished' && !fatal;

  const shell = (children: React.ReactNode) => (
    <PlayerShell reconnecting={reconnecting}>{children}</PlayerShell>
  );

  if (fatal && phase !== 'finished') {
    return shell(
      <Card className="text-center">
        <p role="alert" className="text-lg font-semibold">{fatal}</p>
        <Link to={`/join/${code}`} className="mt-4 inline-block rounded font-semibold text-brand-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Back to join</Link>
      </Card>
    );
  }

  if (phase === 'lobby') {
    return shell(
      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">In lobby</p>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">You're in!</h1>
        {me.nickname && (
          <p className="mt-4 text-3xl font-bold text-ink [overflow-wrap:anywhere]" data-testid="my-nickname">
            {me.nickname}
          </p>
        )}
        {me.team && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 font-semibold text-ink"
            style={{ borderColor: me.team.color, backgroundColor: `${me.team.color}1A` }}>
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: me.team.color }} />
            Team {me.team.name}
          </p>
        )}
        <p className="mt-4 text-ink-muted">Waiting for the host to start…</p>
        {playerCount !== null && playerCount > 1 && (
          <p className="mt-1 text-sm text-ink-muted">{playerCount} players have joined</p>
        )}
      </Card>
    );
  }

  if (phase === 'question' && question) {
    const remaining = Math.max(0, (endsAt - now) / 1000);
    const timeUp = remaining <= 0;
    const answer = (value: unknown, choice: PickedAnswer) => {
      if (picked) return;
      setPicked(choice);
      setError(null);
      navigator.vibrate?.(30);
      send({ type: 'ANSWER', questionId: question.id, answer: value });
    };
    return shell(
      <>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-muted">Q{question.index + 1} · {score} pts</span>
          {question.type !== 'slide' && <CountdownRing remaining={remaining} total={question.timeLimitSec} />}
        </div>
        <h2 className="mb-6 text-xl font-bold text-ink">{question.prompt}</h2>
        {paused ? (
          <Card className="text-center"><p className="text-lg font-semibold">Paused by host</p></Card>
        ) : submitted || picked ? (
          <SubmittedCard picked={picked} confirmed={submitted} />
        ) : timeUp && question.type !== 'slide' ? (
          <Card className="text-center"><p className="text-lg font-semibold">Time's up!</p></Card>
        ) : (
          <AnswerInput question={question} onSubmit={answer} />
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </>
    );
  }

  if (phase === 'reveal' && question) {
    const team = teamInfo ?? (standing?.team
      ? { name: standing.team.name, color: standing.team.color, score: standing.team.score } : null);
    return shell(
      <PlayerFeedback
        question={question} correct={correct} correctAnswer={reveal ?? { type: 'none' }}
        answered={submitted} pointsAwarded={lastPoints} score={score} streak={streak}
        team={team} standing={standing}
      />
    );
  }

  if (phase === 'finished') {
    const gap = standing ? gapLine(standing, true) : null;
    const highlightId = podium?.kind === 'teams' ? (standing?.team?.id ?? me.team?.id) : playerIdRef.current;
    return shell(
      <>
        <Card className="mb-4 text-center">
          <h2 className="text-2xl font-bold text-brand-700">Game over</h2>
          {me.nickname && <p className="mt-1 font-semibold text-ink-muted [overflow-wrap:anywhere]">{me.nickname}</p>}
          {standing && (
            <p aria-live="polite" className="mt-3 text-xl font-bold text-ink" data-testid="final-rank">
              {rankLine(standing, true)}
            </p>
          )}
          {gap && <p className="mt-1 text-sm text-ink-muted">{gap}</p>}
          <p className="mt-4 text-ink-muted">Your final score</p>
          <p className="text-4xl font-bold tabular-nums">{standing?.score ?? score}</p>
          {standing?.team && (
            <p className="mt-3 text-sm font-semibold text-ink">
              <span aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle"
                style={{ backgroundColor: standing.team.color }} />
              {teamLine(standing.team)}
            </p>
          )}
        </Card>
        {podium && <Leaderboard standings={podium} highlightId={highlightId} />}
        <Link to="/join" className="mt-6 self-center rounded text-center font-semibold text-brand-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Join another game</Link>
      </>
    );
  }

  return shell(<p role="status" className="text-center text-ink-muted">Connecting…</p>);
}

function SubmittedCard({ picked, confirmed }: { picked: PickedAnswer | null; confirmed: boolean }) {
  return (
    <Card className="text-center">
      <p role="status" className="text-lg font-semibold">{confirmed ? 'Answer submitted' : 'Sending…'}</p>
      {picked ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">You picked</p>
          <div className={cn(
            'mt-2 flex items-center gap-3 rounded-tile p-3 text-left text-lg font-bold',
            picked.color ? PICK_STYLES[picked.color] : 'bg-brand-50 text-ink'
          )}>
            {picked.index !== undefined && (
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-black/20 text-sm">
                {picked.index + 1}
              </span>
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">{picked.label}</span>
          </div>
          <p className="mt-3 text-ink-muted">Waiting for others…</p>
        </>
      ) : (
        <p className="text-ink-muted">Waiting for others…</p>
      )}
    </Card>
  );
}
