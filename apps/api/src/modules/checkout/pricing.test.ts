import { describe, expect, it } from 'vitest';
import {
  checkCoupon,
  describeCoupon,
  priceLines,
  totals,
  type CouponRules,
  type PricedItem,
} from './pricing.js';

const NOW = new Date('2026-06-01T12:00:00Z');

const coupon = (overrides: Partial<CouponRules> = {}): CouponRules => ({
  code: 'BECA',
  type: 'percentage',
  value: 10,
  scope: 'all',
  courseId: null,
  editionId: null,
  validFrom: null,
  validUntil: null,
  maxUses: null,
  maxUsesPerUser: 1,
  usesCount: 0,
  active: true,
  ...overrides,
});

const items: PricedItem[] = [
  { editionId: 'e1', courseId: 'c1', unitPriceClp: 89_990 },
  { editionId: 'e2', courseId: 'c2', unitPriceClp: 10_000 },
];

describe('checkCoupon', () => {
  it('accepts a valid coupon', () => {
    expect(checkCoupon(coupon(), { userUses: 0 }, NOW)).toEqual({ ok: true });
  });

  it.each([
    [{ active: false }, 'no está activo'],
    [{ validFrom: new Date('2026-07-01T00:00:00Z') }, 'aún no está vigente'],
    [{ validUntil: NOW }, 'vencido'],
    [{ maxUses: 5, usesCount: 5 }, 'límite de usos'],
  ])('rejects %o', (overrides, reason) => {
    const result = checkCoupon(coupon(overrides), { userUses: 0 }, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(reason);
  });

  it('enforces the per-user limit (null means unlimited)', () => {
    expect(checkCoupon(coupon({ maxUsesPerUser: 1 }), { userUses: 1 }, NOW).ok).toBe(false);
    expect(checkCoupon(coupon({ maxUsesPerUser: null }), { userUses: 9 }, NOW).ok).toBe(true);
  });
});

describe('priceLines', () => {
  it('rounds percentage discounts down per item, in whole pesos', () => {
    const lines = priceLines(items, coupon({ value: 15 }));
    expect(lines.map((line) => line.discountClp)).toEqual([13_498, 1_500]);
    expect(totals(lines)).toEqual({ subtotalClp: 99_990, discountClp: 14_998, totalClp: 84_992 });
  });

  it('makes a 100 % coupon free', () => {
    expect(totals(priceLines(items, coupon({ value: 100 }))).totalClp).toBe(0);
  });

  it('applies a fixed amount once per order without going below zero', () => {
    const lines = priceLines(
      [
        { editionId: 'e2', courseId: 'c2', unitPriceClp: 10_000 },
        { editionId: 'e1', courseId: 'c1', unitPriceClp: 89_990 },
      ],
      coupon({ type: 'fixed_amount', value: 15_000 }),
    );
    expect(lines.map((line) => line.discountClp)).toEqual([10_000, 5_000]);
    expect(lines.every((line) => line.totalClp >= 0)).toBe(true);
  });

  it('only discounts items in the coupon scope', () => {
    const byCourse = priceLines(items, coupon({ scope: 'course', courseId: 'c2' }));
    expect(byCourse.map((line) => line.discountClp)).toEqual([0, 1_000]);
    const byEdition = priceLines(items, coupon({ scope: 'edition', editionId: 'e1' }));
    expect(byEdition.map((line) => line.discountClp)).toEqual([8_999, 0]);
  });

  it('charges the full price without a coupon', () => {
    expect(totals(priceLines(items, null))).toEqual({
      subtotalClp: 99_990,
      discountClp: 0,
      totalClp: 99_990,
    });
  });
});

describe('describeCoupon', () => {
  it('describes the discount in Spanish', () => {
    expect(describeCoupon({ type: 'percentage', value: 10 })).toBe('10 % de descuento');
    expect(describeCoupon({ type: 'fixed_amount', value: 5000 })).toMatch(
      /^\$5\.000 de descuento$/,
    );
  });
});
