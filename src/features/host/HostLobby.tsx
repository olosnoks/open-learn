import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HostShell } from '../../components/layout/HostShell';
import { RoomCode } from '../../components/game/RoomCode';
import { PlayerChip } from '../../components/game/PlayerChip';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useRoomSocket } from '../../lib/useRoomSocket';
import type { PlayerRow, RoomSettings, TeamWithMembers, ServerEvent } from '../../shared/types';

/** Human labels for the non-default game options, shown as badges so the host can double-check. */
function settingBadges(s: RoomSettings | null): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.nicknameGenerator) out.push('Random nicknames');
  if (s.showAnswersOnDevices === false) out.push('Shapes only on phones');
  if (s.autoAdvance) out.push('Auto-advance');
  if (s.shuffleQuestions) out.push('Shuffled questions');
  if (s.shuffleAnswers) out.push('Shuffled answers');
  return out;
}

export function HostLobby({ hostToken }: { hostToken: string }) {
  const { sessionId = '', code = '' } = useParams<{ sessionId: string; code: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [error, setError] = useState<string | null>(
    hostToken ? null : 'No host token in this tab. Create the room from this browser tab to control it.'
  );

  const gamePath = `/host/${sessionId}/${code}/game`;

  const { send, status } = useRoomSocket(code, (event: ServerEvent) => {
    switch (event.type) {
      case 'WELCOME':
        setPlayers(event.players); setTeams(event.teams);
        setSettings(event.snapshot?.settings ?? null);
        if (event.phase === 'question' || event.phase === 'reveal') navigate(gamePath, { replace: true });
        if (event.phase === 'finished') navigate(`/sessions/${sessionId}`, { replace: true });
        break;
      case 'LOBBY_UPDATE': setPlayers(event.players); setTeams(event.teams); break;
      case 'QUESTION_STARTED': navigate(gamePath); break;
      case 'ERROR': setError(event.message); break;
    }
  }, (reason) => setError(reason));

  const kick = (p: PlayerRow) => send({ type: 'HOST_KICK', hostToken, playerId: p.id });
  const badges = settingBadges(settings);
  const canStart = players.length > 0 && status === 'open' && Boolean(hostToken);

  return (
    <HostShell wide>
      <div className="flex flex-1 flex-col gap-6 md:gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4 motion-safe:animate-fade-up">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Lobby</p>
            <h1 className="mt-1 font-display text-4xl font-bold md:text-5xl">Waiting for players</h1>
          </div>
          <p className="rounded-full bg-cream/10 px-5 py-2 text-lg font-semibold ring-1 ring-cream/20" aria-live="polite">
            <span className="font-display text-3xl font-bold tabular-nums">{players.length}</span>
            {' '}{players.length === 1 ? 'player' : 'players'}
          </p>
        </header>

        <div className="motion-safe:animate-fade-up" style={{ animationDelay: '80ms' }}>
          <RoomCode code={code} />
        </div>

        {badges.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Game options">
            {badges.map((b) => (
              <li key={b} className="rounded-full bg-brand-300/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-200 ring-1 ring-brand-300/40">
                {b}
              </li>
            ))}
          </ul>
        )}

        {teams.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {teams.map((t) => (
              <Card key={t.id} className="bg-cream text-ink" style={{ borderTop: `6px solid ${t.color}` }}>
                <div className="mb-3 flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: t.color }} />
                  <h2 className="font-display text-xl font-bold">{t.name}</h2>
                  <span className="ml-auto text-sm font-semibold text-ink-muted">
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
            <h2 className="mb-4 font-display text-xl font-bold">Players</h2>
            <div className="flex flex-wrap gap-3">
              {players.length === 0 ? (
                <p className="flex items-center gap-2 text-ink-muted">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-brand-400 motion-safe:animate-shimmer" />
                  Waiting for players to join…
                </p>
              ) : players.map((p) => <PlayerChip key={p.id} player={p} size="lg" onKick={() => kick(p)} />)}
            </div>
          </Card>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}

        <footer className="mt-auto flex flex-col items-center gap-3 pt-4">
          <Button size="xl" variant="secondary" className="min-w-[16rem]"
            onClick={() => send({ type: 'HOST_START', hostToken })} disabled={!canStart}>
            Start game
          </Button>
          {players.length === 0 && <p className="text-sm text-brand-200">The game starts once at least one player has joined.</p>}
        </footer>
      </div>
    </HostShell>
  );
}
