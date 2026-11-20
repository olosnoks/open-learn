/** Room PINs are 6 digits (000000–999999): easy to read aloud and type on a phone keypad. */
export const ROOM_CODE_RE = /^\d{6}$/;

const RANGE = 1_000_000;
// Largest multiple of RANGE that fits in a uint32; values at or above it are rejected
// so every PIN is equally likely (no modulo bias).
const LIMIT = Math.floor(0x1_0000_0000 / RANGE) * RANGE;

export function generateRoomCode(): string {
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= LIMIT);
  return String(buf[0] % RANGE).padStart(6, '0');
}
