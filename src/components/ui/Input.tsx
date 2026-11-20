import { cn } from '../../lib/cn';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-tile border-2 border-brand-200 bg-white px-4 py-3 text-lg',
        'focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/20',
        className
      )}
      {...props}
    />
  );
}
