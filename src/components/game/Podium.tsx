import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { prefersReducedMotion } from '../ui/motion';
import { useCountUp } from '../../features/player/useCountUp';
import type { Standings } from '../../shared/types';

type Spot = { id: string; name: string; score: number; color?: string; members?: number };

const STEPS = [
  { rank: 3, height: 'h-24 md:h-32', metal: 'bg-metal-bronze text-white', delay: 400 },
  { rank: 2, height: 'h-36 md:h-48', metal: 'bg-metal-silver text-ink', delay: 1500 },
  { rank: 1, height: 'h-48 md:h-64', metal: 'bg-metal-gold text-ink', delay: 2700 },
];

function toSpots(standings: Standings): Spot[] {
  return standings.kind === 'teams'
    ? standings.rows.map((r) => ({ id: r.id, name: r.name, score: r.score, color: r.color, members: r.memberCount }))
    : standings.rows.map((r) => ({ id: r.id, name: r.nickname, score: r.score }));
}

/**
 * Final podium. Reveals 3rd, then 2nd, then 1st (all at once under reduced motion or `staged={false}`).
 * The first three rows of `standings` are used, in rank order.
 */
export function Podium({ standings, staged = true, className }: { standings: Standings; staged?: boolean; className?: string }) {
  const spots = toSpots(standings).slice(0, 3);
  const animate = staged && !prefersReducedMotion();
  const [shown, setShown] = useState<Set<number>>(() => (animate ? new Set() : new Set([1, 2, 3])));

  useEffect(() => {
    if (!animate) return;
    const timers = STEPS.map((s) => setTimeout(() => setShown((prev) => new Set(prev).add(s.rank)), s.delay));
    return () => timers.forEach(clearTimeout);
  }, [animate]);

  const winner = spots[0];
  const done = shown.has(1);

  // Visual order left → right: 2nd, 1st, 3rd.
  const order = [STEPS[1], STEPS[2], STEPS[0]];

  return (
    <div className={cn('mx-auto w-full max-w-3xl', className)}>
      <p className="sr-only" aria-live="polite">{done && winner ? `${winner.name} wins with ${winner.score} points` : ''}</p>
      <div className="grid grid-cols-3 items-end gap-3 md:gap-6">
        {order.map((step) => {
          const spot = spots[step.rank - 1];
          const visible = shown.has(step.rank);
          return (
            <div key={step.rank} className={cn('flex flex-col items-center gap-3', !visible && 'invisible')}>
              {visible && spot && <SpotCard spot={spot} rank={step.rank} />}
              {visible && !spot && <p className="text-sm text-brand-200">—</p>}
              <div className={cn(
                'flex w-full items-start justify-center rounded-t-2xl pt-3 shadow-card motion-safe:animate-rise',
                step.height, step.metal,
              )}>
                <span className="font-display text-4xl font-bold md:text-6xl">{step.rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpotCard({ spot, rank }: { spot: Spot; rank: number }) {
  const score = useCountUp(spot.score, 0, 900);
  return (
    <div className={cn(
      'w-full rounded-tile bg-cream px-3 py-3 text-center text-ink shadow-card motion-safe:animate-pop-in',
      rank === 1 && 'ring-4 ring-metal-gold',
    )}>
      <p className="flex items-center justify-center gap-2 truncate font-display text-lg font-bold md:text-2xl">
        {spot.color && <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: spot.color }} />}
        <span className="truncate">{spot.name}</span>
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums text-ink-muted md:text-xl">
        <span aria-hidden="true">{score}</span>
        <span className="sr-only">{spot.score}</span> pts
      </p>
    </div>
  );
}
