import { ConnectionBanner } from '../game/ConnectionBanner';
import { cn } from '../../lib/cn';

/**
 * Phone-first layout for player screens. Padding respects notches and home indicators
 * (index.html sets viewport-fit=cover); `reconnecting` shows a non-blocking status banner.
 */
export function PlayerShell({
  children, reconnecting = false, className,
}: { children: React.ReactNode; reconnecting?: boolean; className?: string }) {
  return (
    <div className="player-backdrop min-h-dvh overflow-x-hidden text-ink">
      <ConnectionBanner visible={reconnecting} />
      <main
        className={cn('mx-auto flex min-h-dvh w-full max-w-md flex-col', className)}
        style={{
          paddingTop: 'max(1.25rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {children}
      </main>
    </div>
  );
}
