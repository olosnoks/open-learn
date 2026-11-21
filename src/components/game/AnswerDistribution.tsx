import { cn } from '../../lib/cn';
import { AnswerShape, TILE_BG, shapeName, type AnswerTileColor } from './AnswerTile';

export type DistributionItem = {
  key: string;
  label: string;
  color: AnswerTileColor;
  count: number;
  /** true = a correct answer; false = not; null/undefined = ungraded (polls). */
  correct?: boolean | null;
};

/** Column chart of how players answered. Pure CSS; bars grow in, non-correct bars fade. */
export function AnswerDistribution({ items, className }: { items: DistributionItem[]; className?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((s, i) => s + i.count, 0);
  const graded = items.some((i) => i.correct === true);
  const summary = items.map((i) => `${i.color} ${shapeName(i.color)}: ${i.count}`).join(', ');
  return (
    <figure className={cn('mx-auto w-full max-w-3xl', className)} aria-label={`Answer distribution, ${total} answers. ${summary}`}>
      <div className="flex h-44 items-end justify-center gap-3 md:h-52 md:gap-6" aria-hidden="true">
        {items.map((it, i) => {
          const dim = graded && !it.correct;
          return (
            <div key={it.key} className="flex h-full max-w-[180px] flex-1 flex-col items-center justify-end gap-2">
              <span className={cn('font-display text-2xl font-bold tabular-nums text-cream md:text-4xl', dim && 'opacity-50')}>
                {it.count}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn('w-full origin-bottom rounded-t-xl motion-safe:animate-bar-grow', TILE_BG[it.color], dim && 'opacity-35 saturate-50')}
                  style={{ height: `${Math.max(3, (it.count / max) * 100)}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
              <span className={cn('grid h-11 w-11 place-items-center rounded-xl md:h-14 md:w-14', TILE_BG[it.color], dim && 'opacity-50')}>
                <AnswerShape color={it.color} className="h-6 w-6 md:h-8 md:w-8" />
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">
        <ul>
          {items.map((it) => (
            <li key={it.key}>{it.label}: {it.count} {it.correct ? '(correct)' : ''}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
