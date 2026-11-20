export function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const pct = Math.max(0, Math.min(1, remaining / total));
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - pct);
  return (
    <div className="relative grid h-24 w-24 place-items-center rounded-full bg-cream" role="timer" aria-label={`${Math.ceil(remaining)} seconds left`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--cream-200)" strokeWidth="8" />
        <circle cx="50" cy="50" r="44" fill="none"
          stroke={pct < 0.25 ? 'var(--danger)' : 'var(--brand-700)'}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <span className="text-2xl font-bold tabular-nums text-ink">{Math.ceil(remaining)}</span>
    </div>
  );
}
