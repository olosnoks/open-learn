import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { PlayerShell } from '../../components/layout/PlayerShell';
import { useRoomSocket } from '../../lib/useRoomSocket';
import { savePlayerIdentity } from '../../lib/storage';
import type { ServerEvent, TeamWithMembers } from '../../shared/types';

export function JoinScreen() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState((code ?? '').replace(/\D/g, '').slice(0, 6));
  const [nickname, setNickname] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTeam, setIsTeam] = useState(false);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);

  const { send, status } = useRoomSocket(
    roomCode.length === 6 ? roomCode : null,
    (event: ServerEvent) => {
      switch (event.type) {
        case 'WELCOME':
          setError(null);
          setIsTeam(event.isTeam);
          setTeams(event.teams);
          break;
        case 'LOBBY_UPDATE':
          setTeams(event.teams);
          break;
        case 'JOINED': {
          const team = isTeam ? teams.find((t) => t.id === teamId) : undefined;
          savePlayerIdentity({
            sessionId: event.sessionId, playerId: event.playerId, roomCode,
            nickname: nickname.trim(),
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
    if (!nickname.trim()) return setError('Enter a nickname');
    if (status !== 'open') return setError('Still connecting — try again in a moment');
    if (isTeam && !teamId) return setError('Pick a team');
    send({ type: 'JOIN', nickname: nickname.trim(), teamId: teamId ?? undefined });
  };

  return (
    <PlayerShell>
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">mscoding.org</p>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">Live Quiz</h1>
      </header>
      <Card>
        <form onSubmit={join} className="space-y-4">
          <div>
            <label htmlFor="pin" className="mb-1 block text-sm font-semibold text-ink-muted">Game PIN</label>
            <Input id="pin" value={roomCode} autoComplete="off" autoFocus={!code}
              inputMode="numeric" pattern="[0-9]*"
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                setRoomCode(next);
                setIsTeam(false); setTeams([]); setTeamId(null); setError(null);
                // Full PIN typed: move straight on to the name field.
                if (next.length === 6) document.getElementById('nickname')?.focus();
              }}
              placeholder="123456" maxLength={6}
              className="text-center text-2xl font-bold tracking-widest" />
          </div>
          {isTeam && (
            <fieldset>
              <legend className="mb-1 block text-sm font-semibold text-ink-muted">Team</legend>
              <div className="grid grid-cols-2 gap-2">
                {teams.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTeamId(t.id)} aria-pressed={teamId === t.id}
                    className={`rounded-tile border-2 p-3 text-left font-semibold ${
                      teamId === t.id ? 'border-brand-700' : 'border-brand-200'
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
          <div>
            <label htmlFor="nickname" className="mb-1 block text-sm font-semibold text-ink-muted">Nickname</label>
            <Input id="nickname" value={nickname} autoComplete="nickname"
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              placeholder="Your name" maxLength={20} />
          </div>
          {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={isTeam && !teamId}>Join game</Button>
        </form>
      </Card>
    </PlayerShell>
  );
}
