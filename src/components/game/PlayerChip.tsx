import type { PlayerRow } from '../../shared/types';

export function PlayerChip({ player, onKick }: { player: PlayerRow; onKick?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700 ${player.connected ? '' : 'opacity-50'}`}>
      {player.nickname}
      {onKick && (
        <button type="button" onClick={onKick} aria-label={`Remove ${player.nickname}`}
          className="ml-1 rounded-full px-1 text-brand-500 hover:bg-brand-200 hover:text-brand-800">×</button>
      )}
    </span>
  );
}
