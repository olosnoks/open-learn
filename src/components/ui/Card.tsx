import { cn } from '../../lib/cn';

/** Paper surface. Pages on the dark host shell pass `bg-cream text-ink`; the defaults suit cream pages. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-tile bg-white p-6 text-ink shadow-card ring-1 ring-brand-900/5', className)}
      {...props}
    />
  );
}
