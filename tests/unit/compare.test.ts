import { describe, expect, it } from 'vitest';
import { safeEqual } from '../../worker/auth/compare';

describe('safeEqual', () => {
  it('matches identical strings', () => {
    expect(safeEqual('otter-42', 'otter-42')).toBe(true);
  });
  it('rejects different strings of the same length', () => {
    expect(safeEqual('otter-42', 'otter-43')).toBe(false);
  });
  it('rejects different lengths, including prefixes and empty', () => {
    expect(safeEqual('otter', 'otter-42')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
  it('handles non-ASCII', () => {
    expect(safeEqual('café', 'café')).toBe(true);
    expect(safeEqual('café', 'cafe')).toBe(false);
  });
});
