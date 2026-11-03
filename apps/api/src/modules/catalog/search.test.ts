import { describe, expect, it } from 'vitest';
import { buildTsQuery } from './search.js';

describe('buildTsQuery', () => {
  it('turns every word into a required prefix term', () => {
    expect(buildTsQuery('Programación web')).toBe('programación:* & web:*');
  });

  it('strips characters that have meaning in tsquery syntax', () => {
    expect(buildTsQuery("excel') | !(drop & table:*")).toBe('excel:* & drop:* & table:*');
  });

  it('removes duplicated terms and limits the number of terms', () => {
    expect(buildTsQuery('web web web')).toBe('web:*');
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`).join(' ');
    expect(buildTsQuery(many)?.split(' & ')).toHaveLength(8);
  });

  it('returns undefined when nothing searchable remains', () => {
    expect(buildTsQuery(undefined)).toBeUndefined();
    expect(buildTsQuery('')).toBeUndefined();
    expect(buildTsQuery(' ¡¿?! ')).toBeUndefined();
  });
});
