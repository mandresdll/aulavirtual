import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  fromLocalDateTimeInput,
  nextIsoDate,
  startOfLocalDay,
  toLocalDateTimeInput,
  toLocalIsoDate,
} from './dates.js';

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

describe('local day boundaries', () => {
  it('returns the UTC instant of local midnight', () => {
    expect(startOfLocalDay('2026-03-01').toISOString()).toBe('2026-03-01T03:00:00.000Z');
    expect(startOfLocalDay('2026-12-31').toISOString()).toBe('2026-12-31T03:00:00.000Z');
  });

  it('round-trips with toLocalIsoDate', () => {
    const start = startOfLocalDay('2026-07-15');
    expect(toLocalIsoDate(start)).toBe('2026-07-15');
    expect(toLocalIsoDate(new Date(start.getTime() - 1))).toBe('2026-07-14');
  });

  it('rejects malformed dates', () => {
    expect(() => startOfLocalDay('15-07-2026')).toThrow(RangeError);
  });

  it('computes the next calendar day across month and year ends', () => {
    expect(nextIsoDate('2026-02-28')).toBe('2026-03-01');
    expect(nextIsoDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('datetime-local inputs in Punta Arenas time', () => {
  it('formats a UTC instant as a local input value', () => {
    expect(toLocalDateTimeInput(new Date('2026-03-01T02:30:00Z'))).toBe('2026-02-28T23:30');
  });

  it('parses a local input value back to UTC', () => {
    expect(fromLocalDateTimeInput('2026-02-28T23:30').toISOString()).toBe(
      '2026-03-01T02:30:00.000Z',
    );
  });

  it('round-trips', () => {
    const instant = new Date('2026-09-10T18:45:00Z');
    expect(fromLocalDateTimeInput(toLocalDateTimeInput(instant))).toEqual(instant);
  });

  it('rejects malformed values', () => {
    expect(() => fromLocalDateTimeInput('2026-02-28 23:30')).toThrow(RangeError);
  });
});
