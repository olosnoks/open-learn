const KEY = 'live-quiz:player';

/**
 * Saved when a player joins. `nickname` and `team` were added later and are optional,
 * so identities saved by older builds still load.
 */
export type PlayerIdentity = {
  sessionId: string;
  playerId: string;
  roomCode: string;
  nickname?: string;
  team?: { id: string; name: string; color: string };
};

export function savePlayerIdentity(identity: PlayerIdentity) {
  localStorage.setItem(KEY, JSON.stringify(identity));
}

export function getPlayerIdentity(): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerIdentity> | null;
    if (!parsed || typeof parsed.playerId !== 'string' || typeof parsed.roomCode !== 'string') return null;
    const team = parsed.team;
    return {
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
      playerId: parsed.playerId,
      roomCode: parsed.roomCode,
      ...(typeof parsed.nickname === 'string' ? { nickname: parsed.nickname } : {}),
      ...(team && typeof team.id === 'string' && typeof team.name === 'string' && typeof team.color === 'string'
        ? { team: { id: team.id, name: team.name, color: team.color } } : {}),
    };
  } catch { return null; }
}

export function clearPlayerIdentity() { localStorage.removeItem(KEY); }
