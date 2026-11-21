import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';

/**
 * The one button. `primary` is brand green for cream pages; `secondary` is the cream pill
 * that reads well on the dark host shell; `ghost` is low-emphasis on either background.
 */
export function Button({
  variant = 'primary', size = 'md', className, type = 'button', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base = cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-tile font-semibold',
    'transition-[transform,box-shadow,background-color,color,opacity] duration-150',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/60',
    'active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50',
  );
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-700 text-cream shadow-tile hover:bg-brand-600 active:shadow-tile-pressed',
    secondary: 'border-2 border-brand-700 bg-cream text-brand-800 shadow-tile hover:bg-white active:shadow-tile-pressed',
    ghost: 'bg-transparent text-current hover:bg-black/10 active:bg-black/15',
    danger: 'bg-[var(--danger)] text-cream shadow-tile hover:brightness-110 active:shadow-tile-pressed',
  };
  const sizes: Record<Size, string> = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-5 text-base',
    lg: 'h-14 px-8 text-lg',
    xl: 'h-16 px-10 text-xl',
  };
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
