import { cn } from '../../lib/cn';

/** Brand mark: the four answer shapes in a 2x2 grid. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn('shrink-0', className)}>
      <path d="M6 1.5 11 10H1Z" fill="var(--answer-red)" />
      <path d="M18 1 23 6 18 11 13 6Z" fill="var(--answer-blue)" />
      <circle cx="6" cy="18" r="5" fill="var(--answer-yellow)" />
      <rect x="13" y="13" width="10" height="10" rx="1.5" fill="var(--answer-green)" />
    </svg>
  );
}
