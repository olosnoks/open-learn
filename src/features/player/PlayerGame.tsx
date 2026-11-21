import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlayerShell } from '../../components/layout/PlayerShell';
import { CountdownRing } from '../../components/game/CountdownRing';
import { Leaderboard } from '../../components/game/Leaderboard';
import { AnswerTile } from '../../components/game/AnswerTile';
import { QuestionImage } from '../../components/game/QuestionImage';
import { Card } from '../../components/ui/Card';
import { PlayerFeedback } from './PlayerFeedback';
import { AnswerInput, type PickedAnswer } from './AnswerInput';
import { gapLine, rankLine, teamLine } from './standing';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { useNow } from '../../lib/useNow';
import { clearPlayerIdentity, getPlayerIdentity } from '../../lib/storage';
import type {
  CorrectAnswer, GamePhase, PersonalStanding, PlayerRow, RoomSettings, ServerEvent, Standings,
  TeamWithMembers, WireQuestion,
} from '../../shared/types';

type Me = { nickname: string | null; team: { id: string; name: string; color: string } | null };

const isChoiceType = (q: WireQuestion) =>
  q.config.type === 'quiz' || q.config.type === 'multi_select' || q.config.type === 'poll';

export function PlayerGame() {
  const { code = '' } = useParams<{ code: string }>();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
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
  const showAnswers = settings?.showAnswersOnDevices ?? true;

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
        if (event.snapshot?.settings) setSettings(event.snapshot.settings);
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
        if (s.settings) setSettings(s.settings);
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

  const linkClass = 'rounded font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

  if (fatal && phase !== 'finished') {
    return shell(
      <Card className="m-auto w-full text-center">
        <p role="alert" className="text-lg font-semibold">{fatal}</p>
        <Link to={`/join/${code}`} className={`mt-4 inline-block ${linkClass}`}>Back to join</Link>
      </Card>
    );
  }

  if (phase === 'lobby') {
    return shell(
      <Card className="m-auto w-full text-center motion-safe:animate-pop-in">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">In lobby</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-brand-700">You're in!</h1>
        {me.nickname && (
          <p className="mt-4 font-display text-3xl font-bold text-ink [overflow-wrap:anywhere]" data-testid="my-nickname">
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
        <div className="mt-6 rounded-tile bg-brand-50 p-4">
          <p className="font-display text-xl font-bold text-brand-800">Look at the screen!</p>
          <p className="mt-1 text-sm text-ink-muted">Waiting for the host to start…</p>
        </div>
        {playerCount !== null && playerCount > 1 && (
          <p className="mt-3 text-sm text-ink-muted" aria-live="polite">{playerCount} players have joined</p>
        )}
      </Card>
    );
  }

  if (phase === 'question' && question) {
    const remaining = Math.max(0, (endsAt - now) / 1000);
    const timeUp = remaining <= 0;
    const shapesOnly = !showAnswers && isChoiceType(question);
    const answer = (value: unknown, choice: PickedAnswer) => {
      if (picked) return;
      setPicked(choice);
      setError(null);
      navigator.vibrate?.(30);
      send({ type: 'ANSWER', questionId: question.id, answer: value });
    };
    return shell(
      <>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Question {question.index + 1}</p>
            <p className="font-semibold tabular-nums text-ink-muted">{score} pts</p>
          </div>
          {question.type !== 'slide' && <CountdownRing size="sm" remaining={remaining} total={question.timeLimitSec} />}
        </div>
        <h2 className="mb-4 font-display text-xl font-bold leading-snug text-ink [overflow-wrap:anywhere]">{question.prompt}</h2>
        <QuestionImage src={question.imageUrl} variant="player" className="mb-4" />
        {paused ? (
          <Card className="text-center"><p role="status" className="text-lg font-semibold">Paused by host</p></Card>
        ) : submitted || picked ? (
          <SubmittedCard picked={picked} confirmed={submitted} />
        ) : timeUp && question.type !== 'slide' ? (
          <Card className="text-center"><p role="status" className="text-lg font-semibold">Time's up!</p></Card>
        ) : (
          <>
            {shapesOnly && <p className="mb-3 text-center text-sm font-semibold text-ink-muted">Answers are on the big screen</p>}
            <AnswerInput question={question} onSubmit={answer} showLabels={showAnswers} />
          </>
        )}
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
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
        team={team} standing={standing} showAnswers={showAnswers}
      />
    );
  }

  if (phase === 'finished') {
    const gap = standing ? gapLine(standing, true) : null;
    const highlightId = podium?.kind === 'teams' ? (standing?.team?.id ?? me.team?.id) : playerIdRef.current;
    const top3 = standing && standing.rank <= 3;
    return shell(
      <>
        <Card className={`mb-4 text-center motion-safe:animate-pop-in ${top3 ? 'ring-4 ring-metal-gold' : ''}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Game over</p>
          {me.nickname && <h2 className="mt-1 font-display text-2xl font-bold text-ink [overflow-wrap:anywhere]">{me.nickname}</h2>}
          {standing && (
            <p aria-live="polite" className="mt-4 font-display text-3xl font-bold text-brand-700" data-testid="final-rank">
              {rankLine(standing, true)}
            </p>
          )}
          {gap && <p className="mt-1 text-sm text-ink-muted">{gap}</p>}
          <p className="mt-5 text-sm text-ink-muted">Your final score</p>
          <p className="font-display text-5xl font-bold tabular-nums">{standing?.score ?? score}</p>
          {standing?.team && (
            <p className="mt-3 text-sm font-semibold text-ink">
              <span aria-hidden="true" className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle"
                style={{ backgroundColor: standing.team.color }} />
              {teamLine(standing.team)}
            </p>
          )}
        </Card>
        {podium && <Leaderboard standings={podium} highlightId={highlightId} />}
        <Link to="/join" className={`mt-6 self-center text-center ${linkClass}`}>Join another game</Link>
      </>
    );
  }

  return shell(<p role="status" className="m-auto text-center text-ink-muted">Connecting…</p>);
}

function SubmittedCard({ picked, confirmed }: { picked: PickedAnswer | null; confirmed: boolean }) {
  return (
    <Card className="text-center motion-safe:animate-pop-in">
      <p role="status" className="font-display text-xl font-bold">{confirmed ? 'Answer submitted' : 'Sending…'}</p>
      {picked ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">You picked</p>
          {picked.color && picked.index !== undefined ? (
            <AnswerTile readOnly selected color={picked.color} label={picked.label} index={picked.index}
              hideLabel={picked.hideLabel} className="mt-2 min-h-[72px]" />
          ) : (
            <p className="mt-2 rounded-tile bg-brand-50 p-3 text-lg font-bold text-ink [overflow-wrap:anywhere]">{picked.label}</p>
          )}
          <p className="mt-4 text-sm text-ink-muted motion-safe:animate-shimmer">Waiting for others…</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Waiting for others…</p>
      )}
    </Card>
  );
}
