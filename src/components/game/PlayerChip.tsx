import { cn } from '../../lib/cn';
import type { PlayerRow } from '../../shared/types';

/** Lobby chip. Pops in on mount; greys out while the player is disconnected. */
export function PlayerChip({ player, onKick, size = 'md' }: { player: PlayerRow; onKick?: () => void; size?: 'md' | 'lg' }) {
  return (
    <span className={cn(
      'inline-flex max-w-full items-center gap-2 rounded-full bg-brand-100 font-semibold text-brand-800 ring-1 ring-brand-900/10 motion-safe:animate-pop-in',
      size === 'lg' ? 'px-5 py-2.5 text-xl' : 'px-4 py-2 text-base',
      !player.connected && 'opacity-50',
    )}>
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', player.connected ? 'bg-brand-500' : 'border-2 border-brand-400')} />
      <span className="truncate">{player.nickname}</span>
      {!player.connected && <span className="sr-only">(disconnected)</span>}
      {onKick && (
        <button type="button" onClick={onKick} aria-label={`Remove ${player.nickname}`}
          className="-mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-brand-600 transition-colors hover:bg-[var(--danger)] hover:text-white focus-visible:bg-[var(--danger)] focus-visible:text-white">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
