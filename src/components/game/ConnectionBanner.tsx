/**
 * Small, non-blocking banner pinned to the top of the screen while the socket reconnects.
 * The live region stays mounted so screen readers announce the change when it appears.
 */
export function ConnectionBanner({ visible }: { visible: boolean }) {
  return (
    <div role="status" aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      {visible && (
        <p className="flex items-center gap-2 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-cream shadow-md">
          <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-cream motion-reduce:animate-none" />
          Reconnecting…
        </p>
      )}
    </div>
  );
}
