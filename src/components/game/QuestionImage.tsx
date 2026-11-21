import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * Optional question picture. `host` is the big projector version, `player` the compact one.
 * Disappears (instead of showing a broken icon) if the image fails to load.
 */
export function QuestionImage({
  src, alt = '', variant = 'player', className,
}: { src?: string; alt?: string; variant?: 'host' | 'player'; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return null;
  return (
    <div className={cn('flex justify-center motion-safe:animate-fade-up', className)}>
      <img
        src={src} alt={alt} decoding="async" referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn(
          'h-auto w-auto max-w-full rounded-tile bg-white/70 object-contain shadow-card',
          variant === 'host' ? 'max-h-[38vh]' : 'max-h-44',
        )}
      />
    </div>
  );
}
