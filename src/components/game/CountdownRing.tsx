import { cn } from '../../lib/cn';

const SIZES = {
  sm: { box: 'h-16 w-16', text: 'text-xl', stroke: 9 },
  md: { box: 'h-24 w-24', text: 'text-3xl', stroke: 8 },
  lg: { box: 'h-32 w-32 lg:h-40 lg:w-40', text: 'text-5xl lg:text-6xl', stroke: 8 },
} as const;

/** Self-coloured (cream disc), so it reads on both the dark host shell and cream phone screens. */
export function CountdownRing({
  remaining, total, size = 'md', className,
}: { remaining: number; total: number; size?: keyof typeof SIZES; className?: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - pct);
  const secs = Math.max(0, Math.ceil(remaining));
  const urgent = secs > 0 && secs <= 5;
  const stroke = pct <= 0.25 ? 'var(--danger)' : pct <= 0.5 ? 'var(--warning)' : 'var(--brand-500)';
  const s = SIZES[size];
  return (
    <div
      className={cn('relative grid shrink-0 place-items-center rounded-full bg-cream text-ink shadow-card', s.box, className)}
      role="timer" aria-label={`${secs} seconds left`}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--cream-200)" strokeWidth={s.stroke} />
        <circle cx="50" cy="50" r="44" fill="none" stroke={stroke}
          strokeWidth={s.stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset,stroke] duration-200 ease-linear" />
      </svg>
      <span className={cn('font-display font-bold tabular-nums', s.text, urgent && 'text-[var(--danger)] motion-safe:animate-shimmer')}>
        {secs}
      </span>
    </div>
  );
}
