import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { PlayerShell } from '../../components/layout/PlayerShell';
import { BrandMark } from '../../components/game/AnswerShapeLogo';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { savePlayerIdentity } from '../../lib/storage';
import { generateNickname } from '../../shared/nicknames';
import type { RoomSettings, ServerEvent, TeamWithMembers } from '../../shared/types';

export function JoinScreen() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState((code ?? '').replace(/\D/g, '').slice(0, 6));
  const [nickname, setNickname] = useState('');
  const [generated, setGenerated] = useState(() => generateNickname());
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTeam, setIsTeam] = useState(false);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [found, setFound] = useState(false);

  const useGenerator = settings?.nicknameGenerator ?? false;
  const chosenName = useGenerator ? generated : nickname.trim();

  const { send, status } = useRoomSocket(
    roomCode.length === 6 ? roomCode : null,
    (event: ServerEvent) => {
      switch (event.type) {
        case 'WELCOME':
          setError(null);
          setFound(true);
          setIsTeam(event.isTeam);
          setTeams(event.teams);
          setSettings(event.snapshot?.settings ?? null);
          break;
        case 'LOBBY_UPDATE':
          setTeams(event.teams);
          break;
        case 'JOINED': {
          const team = isTeam ? teams.find((t) => t.id === teamId) : undefined;
          // The room may assign a nickname (nicknameGenerator): the server's choice wins.
          const finalName = event.nickname?.trim() || chosenName;
          savePlayerIdentity({
            sessionId: event.sessionId, playerId: event.playerId, roomCode,
            nickname: finalName,
            ...(team ? { team: { id: team.id, name: team.name, color: team.color } } : {}),
          });
          navigate(`/play/${roomCode}`);
          break;
        }
        case 'ERROR':
          setError(event.message);
          break;
      }
    },
    (reason) => setError(reason)
  );

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (roomCode.length !== 6) return setError('Enter the 6-digit game PIN');
    if (!chosenName) return setError('Enter a nickname');
    if (status !== 'open') return setError('Still connecting — try again in a moment');
    if (isTeam && !teamId) return setError('Pick a team');
    send({ type: 'JOIN', nickname: chosenName, teamId: teamId ?? undefined });
  };

  const pinHint = roomCode.length !== 6 ? null
    : found ? 'Game found' : status === 'closed' ? null : 'Looking for the game…';

  return (
    <PlayerShell>
      <header className="mb-6 flex flex-col items-center text-center motion-safe:animate-fade-up">
        <BrandMark className="h-14 w-14" />
        <h1 className="mt-3 font-display text-4xl font-bold text-brand-700">OpenLearn</h1>
      </header>
      <Card className="motion-safe:animate-fade-up" style={{ animationDelay: '80ms' }}>
        <form onSubmit={join} className="space-y-5">
          <div>
            <label htmlFor="pin" className="mb-1 block text-sm font-semibold text-ink-muted">Game PIN</label>
            <Input id="pin" value={roomCode} autoComplete="off" autoFocus={!code}
              inputMode="numeric" pattern="[0-9]*"
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                setRoomCode(next);
                setIsTeam(false); setTeams([]); setTeamId(null); setError(null); setSettings(null); setFound(false);
                // Full PIN typed: move straight on to the name field.
                if (next.length === 6) document.getElementById('nickname')?.focus();
              }}
              placeholder="123456" maxLength={6}
              className="h-16 text-center font-display text-3xl font-bold tracking-[0.3em]" />
            {pinHint && (
              <p role="status" className={`mt-1 text-xs font-semibold ${found ? 'text-brand-600' : 'text-ink-muted motion-safe:animate-shimmer'}`}>
                {pinHint}
              </p>
            )}
          </div>
          {isTeam && (
            <fieldset>
              <legend className="mb-1 block text-sm font-semibold text-ink-muted">Team</legend>
              <div className="grid grid-cols-2 gap-2">
                {teams.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTeamId(t.id)} aria-pressed={teamId === t.id}
                    className={`min-h-[64px] rounded-tile border-2 p-3 text-left font-semibold transition-[border-color,box-shadow,transform] active:translate-y-[1px] ${
                      teamId === t.id ? 'border-brand-700 shadow-tile' : 'border-brand-200'
                    }`}
                    style={{ backgroundColor: teamId === t.id ? `${t.color}22` : 'white' }}>
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />{' '}
                    {t.name}
                    <span className="block text-xs font-normal text-ink-muted">
                      {t.memberCount} {t.memberCount === 1 ? 'player' : 'players'}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {useGenerator ? (
            <div>
              <p id="generated-label" className="mb-1 block text-sm font-semibold text-ink-muted">Your nickname</p>
              <div className="flex items-center gap-2 rounded-tile border-2 border-brand-200 bg-brand-50 p-2 pl-4">
                <span data-testid="generated-nickname" aria-live="polite" aria-labelledby="generated-label"
                  className="min-w-0 flex-1 truncate font-display text-xl font-bold text-brand-800">
                  {generated}
                </span>
                <Button size="md" variant="secondary" aria-label="Spin for another nickname"
                  onClick={() => setGenerated(generateNickname())}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" />
                  </svg>
                  Spin
                </Button>
              </div>
              <p className="mt-1 text-xs text-ink-muted">The host turned on random nicknames.</p>
            </div>
          ) : (
            <div>
              <label htmlFor="nickname" className="mb-1 block text-sm font-semibold text-ink-muted">Nickname</label>
              <Input id="nickname" value={nickname} autoComplete="nickname" className="h-14 text-xl"
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                placeholder="Your name" maxLength={20} />
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <Button type="submit" size="xl" className="w-full" disabled={isTeam && !teamId}>Join game</Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Hosting? <a href="/login" className="font-semibold text-brand-700 underline underline-offset-4">Sign in</a>
      </p>
    </PlayerShell>
  );
}
