import { cn } from '../../lib/cn';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-tile border-2 border-brand-200 bg-white px-4 text-lg text-ink',
        'placeholder:text-ink-muted/50 transition-[border-color,box-shadow] duration-150',
        'focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-400/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
}
