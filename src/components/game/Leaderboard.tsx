import { cn } from '../../lib/cn';
import type { Standings } from '../../shared/types';

/** `highlightId` marks the viewer's own player (or team) row. */
export function Leaderboard({ standings, highlightId }: { standings: Standings; highlightId?: string | null }) {
  const rowClass = (id: string) => cn(
    'flex justify-between gap-2 rounded-md px-2 py-0.5 font-semibold',
    highlightId === id && 'bg-brand-100 text-brand-800'
  );
  const you = (id: string) => highlightId === id
    ? <span className="ml-1 text-xs font-semibold uppercase tracking-wide text-brand-600">(you)</span>
    : null;
  return (
    <div className="rounded-tile bg-cream p-4 text-ink shadow-md">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-500">
        {standings.kind === 'teams' ? 'Team standings' : 'Leaderboard'}
      </h3>
      {standings.rows.length === 0 && <p className="text-sm text-ink-muted">No scores yet.</p>}
      <ol className="space-y-1">
        {standings.kind === 'teams'
          ? standings.rows.map((r) => (
              <li key={r.id} className={rowClass(r.id)}>
                <span className="flex items-center gap-2">
                  <span>{r.rank}.</span>
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                  <span>{r.name}</span>
                  <span className="text-xs font-normal text-ink-muted">({r.memberCount})</span>
                  {you(r.id)}
                </span>
                <span className="tabular-nums">{r.score}</span>
              </li>
            ))
          : standings.rows.map((r) => (
              <li key={r.id} className={rowClass(r.id)}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{r.rank}. {r.nickname}{you(r.id)}</span>
                <span className="tabular-nums">{r.score}</span>
              </li>
            ))}
      </ol>
    </div>
  );
}
