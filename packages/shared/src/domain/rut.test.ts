import { describe, expect, it } from 'vitest';
import {
  RutSchema,
  cleanRut,
  computeRutCheckDigit,
  formatRut,
  isValidRut,
  normalizeRut,
} from './rut.js';

describe('computeRutCheckDigit', () => {
  it.each([
    ['12345678', '5'],
    ['11111111', '1'],
    ['10000013', 'K'],
  ])('computes the check digit of %s', (body, dv) => {
    expect(computeRutCheckDigit(body)).toBe(dv);
  });

  it('returns 0 when the remainder is 11', () => {
    // 1×2 + 3×3 = 11 → 11 − 0 = 11 → '0'
    expect(computeRutCheckDigit('31')).toBe('0');
  });
});

describe('isValidRut', () => {
  it('accepts valid RUTs in any common format', () => {
    expect(isValidRut('12.345.678-5')).toBe(true);
    expect(isValidRut('12345678-5')).toBe(true);
    expect(isValidRut('123456785')).toBe(true);
    expect(isValidRut('10.000.013-k')).toBe(true);
  });

  it('rejects a wrong check digit or malformed input', () => {
    expect(isValidRut('12.345.678-9')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
    expect(isValidRut('')).toBe(false);
    expect(isValidRut('123456789012-3')).toBe(false);
  });
});

describe('formatting', () => {
  it('cleans, normalizes and formats', () => {
    expect(cleanRut(' 10.000.013-k ')).toBe('10000013K');
    expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
    expect(formatRut('123456785')).toBe('12.345.678-5');
  });
});

describe('RutSchema', () => {
  it('normalizes valid input and rejects invalid input with a Spanish message', () => {
    expect(RutSchema.parse('12.345.678-5')).toBe('12345678-5');
    const result = RutSchema.safeParse('12.345.678-9');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('RUT inválido');
  });
});
