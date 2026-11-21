import { QrCode } from './QrCode';

/**
 * Projector card: join URL, the six-digit PIN, and a QR code of the direct join link.
 * `data-testid="room-code"` must contain exactly the digits (tests read it).
 */
export function RoomCode({ code, showQr = true }: { code: string; showQr?: boolean }) {
  const joinUrl = `${location.origin}/join/${code}`;
  return (
    <div className="grid items-center gap-6 rounded-tile bg-cream p-6 text-ink shadow-card md:grid-cols-[1fr_auto] md:gap-10 md:p-8">
      <div className="text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">Join at</p>
        <p className="mt-1 break-all font-display text-2xl font-bold text-ink md:text-3xl">{location.host}/join</p>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-brand-500">Game PIN</p>
        <p data-testid="room-code"
          className="mt-1 font-display text-6xl font-bold tabular-nums tracking-[0.18em] text-brand-700 md:text-7xl lg:text-8xl">
          {code}
        </p>
      </div>
      {showQr && (
        <div className="mx-auto flex flex-col items-center gap-2">
          <div className="w-40 rounded-2xl bg-white p-3 shadow-card ring-1 ring-brand-900/10 md:w-48 lg:w-56">
            <QrCode value={joinUrl} label={`QR code to join game ${code}`} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Scan to join</p>
        </div>
      )}
    </div>
  );
}
