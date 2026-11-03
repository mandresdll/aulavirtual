import { describe, expect, it } from 'vitest';
import { CourseListQuerySchema } from '../api/catalog.js';
import { SlugSchema, availableSeats } from './catalog.js';

describe('availableSeats', () => {
  it('subtracts enrollments and active reservations from capacity', () => {
    expect(availableSeats(20, 5, 3)).toBe(12);
  });

  it('never returns a negative number when an edition is oversold', () => {
    expect(availableSeats(10, 10, 2)).toBe(0);
    expect(availableSeats(5, 8, 0)).toBe(0);
  });
});

describe('SlugSchema', () => {
  it('accepts lowercase words separated by hyphens', () => {
    expect(SlugSchema.safeParse('programacion-web-2026').success).toBe(true);
  });

  it.each(['Programacion', 'con espacio', 'doble--guion', '-inicio', 'tílde'])(
    'rejects %s',
    (slug) => {
      expect(SlugSchema.safeParse(slug).success).toBe(false);
    },
  );
});

describe('CourseListQuerySchema', () => {
  it('applies pagination defaults and ignores empty filters', () => {
    expect(CourseListQuerySchema.parse({ q: '  ', area: '', modality: '' })).toEqual({
      page: 1,
      pageSize: 12,
    });
  });

  it('coerces numeric query-string values', () => {
    expect(CourseListQuerySchema.parse({ page: '3', pageSize: '24' })).toMatchObject({
      page: 3,
      pageSize: 24,
    });
  });

  it('rejects page sizes above the maximum and unknown modalities', () => {
    expect(CourseListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(CourseListQuerySchema.safeParse({ modality: 'hibrida' }).success).toBe(false);
  });

  it('rejects a date range that ends before it starts', () => {
    const result = CourseListQuerySchema.safeParse({ from: '2026-05-10', to: '2026-05-01' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('desde');
  });
});
