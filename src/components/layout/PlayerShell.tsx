import { ConnectionBanner } from '../game/ConnectionBanner';

/**
 * Phone-first layout for player screens. Padding respects notches and home indicators
 * (index.html sets viewport-fit=cover); `reconnecting` shows a non-blocking status banner.
 */
export function PlayerShell({
  children, reconnecting = false,
}: { children: React.ReactNode; reconnecting?: boolean }) {
  return (
    <div className="min-h-dvh bg-cream text-ink">
      <ConnectionBanner visible={reconnecting} />
      <main
        className="mx-auto flex min-h-dvh max-w-md flex-col"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
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
