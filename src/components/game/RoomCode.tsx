export function RoomCode({ code }: { code: string }) {
  return (
    <div className="rounded-tile bg-cream p-6 text-center text-ink shadow-md">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-500">
        Join at {location.host}/join
      </p>
      <p data-testid="room-code" className="mt-2 text-5xl font-black tracking-[0.3em] text-brand-700">{code}</p>
    </div>
  );
}
