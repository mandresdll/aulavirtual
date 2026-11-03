import { describe, expect, it } from 'vitest';
import { ClpAmountSchema, formatClp, percentageOf } from './money.js';

describe('ClpAmountSchema', () => {
  it('accepts non-negative integers', () => {
    expect(ClpAmountSchema.parse(0)).toBe(0);
    expect(ClpAmountSchema.parse(129990)).toBe(129990);
  });

  it('rejects decimals and negatives', () => {
    expect(ClpAmountSchema.safeParse(10.5).success).toBe(false);
    expect(ClpAmountSchema.safeParse(-1).success).toBe(false);
  });
});

describe('formatClp', () => {
  it('formats with Chilean thousands separator and no decimals', () => {
    expect(formatClp(129990)).toMatch(/^\$\s?129\.990$/);
    expect(formatClp(0)).toMatch(/^\$\s?0$/);
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatClp(10.5)).toThrow(RangeError);
  });
});

describe('percentageOf', () => {
  it('rounds down so discounts never exceed the declared percentage', () => {
    expect(percentageOf(9990, 15)).toBe(1498);
    expect(percentageOf(10000, 100)).toBe(10000);
    expect(percentageOf(10000, 0)).toBe(0);
  });

  it('rejects out-of-range percentages', () => {
    expect(() => percentageOf(1000, 101)).toThrow(RangeError);
    expect(() => percentageOf(1000, -1)).toThrow(RangeError);
  });
});
