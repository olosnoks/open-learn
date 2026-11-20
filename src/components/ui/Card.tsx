import { cn } from '../../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-tile bg-white p-6 shadow-md', className)} {...props} />;
}
