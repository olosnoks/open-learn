import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'primary', size = 'md', className, type = 'button', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-tile transition-transform active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-700 text-cream shadow-tile hover:bg-brand-800 active:shadow-tile-pressed',
    secondary: 'bg-cream text-brand-700 border-2 border-brand-700 hover:bg-cream-100',
    ghost: 'bg-transparent text-current hover:bg-brand-50/20',
    danger: 'bg-[var(--danger)] text-cream hover:brightness-110',
  };
  const sizes: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-base',
    lg: 'px-8 py-4 text-xl',
  };
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
