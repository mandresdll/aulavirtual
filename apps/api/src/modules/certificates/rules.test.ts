import { describe, expect, it } from 'vitest';
import {
  decideResult,
  generateCertificateCode,
  normalizeCertificateCode,
  type ResultInput,
} from './rules.js';

const END = new Date('2026-06-30T12:00:00Z');
const DURING = new Date('2026-06-15T12:00:00Z');
const IN_GRACE = new Date('2026-07-10T12:00:00Z');
const AFTER = new Date('2026-08-15T12:00:00Z');

const input = (overrides: Partial<ResultInput>): ResultInput => ({
  criterion: 'completion',
  passingGrade: null,
  completed: false,
  grade: null,
  endsAt: END,
  now: DURING,
  graceDays: 30,
  ...overrides,
});

describe('decideResult', () => {
  it('approves by completion as soon as Moodle reports it', () => {
    expect(decideResult(input({ completed: true }))).toBe('completed');
  });

  it('approves by grade from the passing grade, inclusive', () => {
    const grade = { criterion: 'grade' as const, passingGrade: 4 };
    expect(decideResult(input({ ...grade, grade: 4 }))).toBe('completed');
    expect(decideResult(input({ ...grade, grade: 3.9 }))).toBe('pending');
  });

  it('ignores completion when the criterion is the grade', () => {
    expect(
      decideResult(
        input({ criterion: 'grade', passingGrade: 4, completed: true, grade: 2, now: AFTER }),
      ),
    ).toBe('failed_course');
  });

  it('waits during the course and the grace period', () => {
    expect(decideResult(input({ now: DURING }))).toBe('pending');
    expect(decideResult(input({ now: IN_GRACE }))).toBe('pending');
  });

  it('fails the course after the grace period', () => {
    expect(decideResult(input({ now: AFTER }))).toBe('failed_course');
  });

  it('sends a grade course without a grade to manual review', () => {
    const noGrade = { criterion: 'grade' as const, passingGrade: 4, grade: null };
    expect(decideResult(input({ ...noGrade, now: AFTER }))).toBe('needs_review');
    expect(decideResult(input({ ...noGrade, now: IN_GRACE }))).toBe('pending');
  });
});

describe('certificate codes', () => {
  it('generates readable, non sequential codes', () => {
    const codes = new Set(Array.from({ length: 500 }, generateCertificateCode));
    expect(codes.size).toBe(500);
    for (const code of codes)
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
  });

  it('accepts what people type', () => {
    expect(normalizeCertificateCode('abcd-efgh-jkmn')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeCertificateCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeCertificateCode(' abcd efgh jkmn ')).toBe('ABCD-EFGH-JKMN');
    expect(normalizeCertificateCode('O0IL-AAAA-BBBB')).toBe('0011-AAAA-BBBB');
  });

  it('rejects anything else', () => {
    expect(normalizeCertificateCode('corto')).toBeNull();
    expect(normalizeCertificateCode('UUUU-AAAA-BBBB')).toBeNull();
    expect(normalizeCertificateCode("' OR 1=1 --xxxxx")).toBeNull();
  });
});
