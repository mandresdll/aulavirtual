import { describe, expect, it } from 'vitest';
import { formatDateTime, toLocalIsoDate } from './dates.js';

describe('dates in America/Punta_Arenas (UTC-3 all year)', () => {
  it('converts a UTC instant to the local calendar date', () => {
    expect(toLocalIsoDate(new Date('2026-03-01T02:00:00Z'))).toBe('2026-02-28');
    expect(toLocalIsoDate(new Date('2026-03-01T03:00:00Z'))).toBe('2026-03-01');
  });

  it('formats local time in Spanish', () => {
    const text = formatDateTime(new Date('2026-07-15T15:30:00Z'));
    expect(text).toContain('julio');
    expect(text).toContain('12:30');
  });
});
