import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { RoomCode } from '../../components/game/RoomCode';
import { PlayerChip } from '../../components/game/PlayerChip';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useRoomSocket } from '../../lib/useRoomSocket';
import type { PlayerRow, TeamWithMembers, ServerEvent } from '../../shared/types';

export function HostLobby({ hostToken }: { hostToken: string }) {
  const { sessionId = '', code = '' } = useParams<{ sessionId: string; code: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [error, setError] = useState<string | null>(
    hostToken ? null : 'No host token in this tab. Create the room from this browser tab to control it.'
  );

  const gamePath = `/host/${sessionId}/${code}/game`;

  const { send, status } = useRoomSocket(code, (event: ServerEvent) => {
    switch (event.type) {
      case 'WELCOME':
        setPlayers(event.players); setTeams(event.teams);
        if (event.phase === 'question' || event.phase === 'reveal') navigate(gamePath, { replace: true });
        if (event.phase === 'finished') navigate(`/sessions/${sessionId}`, { replace: true });
        break;
      case 'LOBBY_UPDATE': setPlayers(event.players); setTeams(event.teams); break;
      case 'QUESTION_STARTED': navigate(gamePath); break;
      case 'ERROR': setError(event.message); break;
    }
  }, (reason) => setError(reason));

  const kick = (p: PlayerRow) => send({ type: 'HOST_KICK', hostToken, playerId: p.id });

  return (
    <HostShell>
      <div className="flex flex-1 flex-col gap-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold">Host lobby</h1>
        </header>
        <RoomCode code={code} />
        {teams.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {teams.map((t) => (
              <Card key={t.id} className="bg-cream text-ink">
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: t.color }} />
                  <h2 className="text-lg font-bold">{t.name}</h2>
                  <span className="ml-auto text-sm text-ink-muted">
                    {t.memberCount} {t.memberCount === 1 ? 'player' : 'players'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {t.members.length === 0 ? (
                    <p className="text-sm text-ink-muted">No players yet</p>
                  ) : t.members.map((p) => <PlayerChip key={p.id} player={p} onKick={() => kick(p)} />)}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-cream text-ink">
            <h2 className="mb-3 text-lg font-bold">Players ({players.length})</h2>
            <div className="flex flex-wrap gap-2">
              {players.length === 0 ? (
                <p className="text-ink-muted">Waiting for players to join…</p>
              ) : players.map((p) => <PlayerChip key={p.id} player={p} onKick={() => kick(p)} />)}
            </div>
          </Card>
        )}
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-auto flex justify-center">
          <Button size="lg" variant="secondary"
            onClick={() => send({ type: 'HOST_START', hostToken })}
            disabled={players.length === 0 || status !== 'open' || !hostToken}>Start game</Button>
        </div>
      </div>
    </HostShell>
  );
}
