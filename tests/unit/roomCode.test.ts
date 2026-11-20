import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_RE } from '../../worker/room/roomCode';

describe('generateRoomCode', () => {
  it('always produces exactly 6 digits (leading zeros kept)', () => {
    for (let i = 0; i < 5000; i++) expect(generateRoomCode()).toMatch(/^\d{6}$/);
  });
  it('is not constant', () => {
    expect(new Set(Array.from({ length: 50 }, generateRoomCode)).size).toBeGreaterThan(45);
  });
});

describe('ROOM_CODE_RE', () => {
  it('accepts 6 digits only', () => {
    expect(ROOM_CODE_RE.test('012345')).toBe(true);
    expect(ROOM_CODE_RE.test('12345')).toBe(false);
    expect(ROOM_CODE_RE.test('1234567')).toBe(false);
    expect(ROOM_CODE_RE.test('ABC123')).toBe(false);
  });
});
