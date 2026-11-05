import { describe, expect, it } from 'vitest';
import {
  aggregateReport,
  allocate,
  ConversionFunnel,
  type FactScope,
  type ReportFacts,
} from './aggregate.js';

const excel: FactScope = {
  courseId: 'c1',
  courseTitle: 'Excel',
  editionId: 'e1',
  editionCode: 'XL-1',
  date: new Date('2026-05-10T12:00:00Z'),
};
const excelJune: FactScope = {
  ...excel,
  editionId: 'e2',
  editionCode: 'XL-2',
  date: new Date('2026-06-10T12:00:00Z'),
};
const word: FactScope = {
  courseId: 'c2',
  courseTitle: 'Word',
  editionId: 'e3',
  editionCode: 'WD-1',
  date: new Date('2026-05-11T12:00:00Z'),
};

const facts: ReportFacts = {
  sales: [
    { ...excel, orderId: 'o1', grossClp: 100, discountClp: 10, refundsClp: 20 },
    { ...word, orderId: 'o1', grossClp: 50, discountClp: 0, refundsClp: 0 },
    { ...excelJune, orderId: 'o2', grossClp: 100, discountClp: 0, refundsClp: 0 },
  ],
  enrollments: [
    { ...excel, paid: true, status: 'completed' },
    { ...excel, paid: false, status: 'failed_course' },
    { ...word, paid: true, status: 'enrolled' },
  ],
  certificates: [excel],
};

describe('allocate', () => {
  it('splits an amount by weight without losing pesos', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [750, 250])).toEqual([750, 250]);
  });

  it('keeps the whole amount when nothing has weight', () => {
    expect(allocate(50, [0, 0])).toEqual([50, 0]);
  });
});

describe('aggregateReport', () => {
  it('adds up totals, counting an order with two courses once', () => {
    const { totals } = aggregateReport(facts, 'course');
    expect(totals).toEqual({
      orders: 2,
      grossClp: 250,
      discountClp: 10,
      refundsClp: 20,
      netClp: 220,
      paidEnrollments: 2,
      freeEnrollments: 1,
      completed: 1,
      failedCourse: 1,
      certificates: 1,
    });
  });

  it('groups by course, highest income first', () => {
    const { rows } = aggregateReport(facts, 'course');
    expect(rows.map((row) => [row.label, row.orders, row.netClp])).toEqual([
      ['Excel', 2, 170],
      ['Word', 1, 50],
    ]);
  });

  it('groups by edition', () => {
    const { rows } = aggregateReport(facts, 'edition');
    expect(rows.map((row) => row.label)).toEqual(['Excel (XL-2)', 'Excel (XL-1)', 'Word (WD-1)']);
  });

  it('groups by local month, in order', () => {
    const { rows } = aggregateReport(facts, 'month');
    expect(rows.map((row) => [row.key, row.netClp])).toEqual([
      ['2026-05', 120],
      ['2026-06', 100],
    ]);
  });
});

describe('ConversionFunnel', () => {
  it('joins every step of the same campaign and keeps direct visits apart', () => {
    const funnel = new ConversionFunnel();
    const campaign = { source: 'facebook', medium: 'social', campaign: 'x' };
    funnel.add('views', campaign, 10);
    funnel.add('leads', campaign);
    funnel.add('orders', campaign);
    funnel.add('paid', campaign);
    funnel.add('views', { source: null, medium: null, campaign: null }, 3);
    expect(funnel.toRows()).toEqual([
      { ...campaign, views: 10, leads: 1, orders: 1, paid: 1 },
      { source: '', medium: '', campaign: '', views: 3, leads: 0, orders: 0, paid: 0 },
    ]);
  });
});
