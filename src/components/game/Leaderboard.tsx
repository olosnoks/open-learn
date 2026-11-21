import { cn } from '../../lib/cn';
import type { Standings } from '../../shared/types';

const MEDAL: Record<number, string> = {
  1: 'bg-metal-gold text-ink',
  2: 'bg-metal-silver text-ink',
  3: 'bg-metal-bronze text-white',
};

/**
 * Ranked list with a score bar behind each row (relative to the leader).
 * `highlightId` marks the viewer's own player (or team) row. `limit` trims to the top N.
 * `size="lg"` is for the projector.
 */
export function Leaderboard({
  standings, highlightId, limit, size = 'md', className,
}: {
  standings: Standings; highlightId?: string | null; limit?: number; size?: 'md' | 'lg'; className?: string;
}) {
  const lg = size === 'lg';
  const rows = limit ? standings.rows.slice(0, limit) : standings.rows;
  const top = Math.max(1, ...rows.map((r) => r.score));
  const you = (id: string) => highlightId === id
    ? <span className="ml-2 rounded-full bg-brand-700 px-2 py-0.5 text-[0.65em] font-bold uppercase tracking-wide text-cream">you</span>
    : null;

  return (
    <div className={cn('rounded-tile bg-cream p-4 text-ink shadow-card md:p-5', className)}>
      <h3 className={cn('mb-3 font-semibold uppercase tracking-widest text-brand-500', lg ? 'text-base' : 'text-xs')}>
        {standings.kind === 'teams' ? 'Team standings' : 'Leaderboard'}
      </h3>
      {rows.length === 0 && <p className="text-sm text-ink-muted">No scores yet.</p>}
      <ol className={cn('space-y-2', lg && 'space-y-3')}>
        {rows.map((r, i) => {
          const name = standings.kind === 'teams' ? (r as { name: string }).name : (r as { nickname: string }).nickname;
          const color = standings.kind === 'teams' ? (r as { color: string }).color : undefined;
          const members = standings.kind === 'teams' ? (r as { memberCount: number }).memberCount : undefined;
          const mine = highlightId === r.id;
          return (
            <li key={r.id}
              className={cn(
                'relative flex items-center gap-3 overflow-hidden rounded-xl px-3 font-semibold motion-safe:animate-fade-up',
                lg ? 'py-3 text-2xl' : 'py-2 text-base',
                mine ? 'bg-brand-100 ring-2 ring-brand-500' : 'bg-white/70',
              )}
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
              <span aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-xl bg-brand-200/50 transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(2, (r.score / top) * 100)}%` }} />
              <span className={cn(
                'relative grid shrink-0 place-items-center rounded-full font-display font-bold tabular-nums',
                lg ? 'h-11 w-11 text-xl' : 'h-8 w-8 text-sm',
                MEDAL[r.rank] ?? 'bg-brand-700 text-cream',
              )}>
                {r.rank}
              </span>
              {color && <span aria-hidden="true" className="relative inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />}
              <span className="relative min-w-0 flex-1 truncate">
                {name}
                {members !== undefined && <span className="ml-1.5 text-[0.7em] font-normal text-ink-muted">({members})</span>}
                {you(r.id)}
              </span>
              <span className="relative shrink-0 tabular-nums">{r.score}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
