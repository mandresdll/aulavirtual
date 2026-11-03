import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { changedFields, PrismaAuditRecorder, type AuditDb } from './audit.js';

function fakeDb() {
  const created: unknown[] = [];
  const db = {
    auditLog: {
      create: async (args: { data: unknown }) => {
        created.push(args.data);
        return args.data;
      },
    },
  } as unknown as AuditDb;
  return { db, created };
}

describe('changedFields', () => {
  it('keeps only the fields that changed, compared by JSON value', () => {
    expect(
      changedFields(
        { priceClp: 89_000, capacity: 30, tags: ['a'], code: 'X' },
        { priceClp: 99_000, capacity: 30, tags: ['a', 'b'], code: 'X' },
      ),
    ).toEqual({
      before: { priceClp: 89_000, tags: ['a'] },
      after: { priceClp: 99_000, tags: ['a', 'b'] },
    });
  });

  it('reports added and removed fields as null on the other side', () => {
    expect(changedFields({ a: 1 }, { b: 2 })).toEqual({
      before: { a: 1, b: null },
      after: { a: null, b: 2 },
    });
  });
});

describe('PrismaAuditRecorder', () => {
  it('writes the entry with JSON-safe values and a bounded user agent', async () => {
    const { db, created } = fakeDb();
    await new PrismaAuditRecorder(db).record({
      actorId: 'u1',
      actorRole: 'uta_admin',
      action: 'edition.update',
      entityType: 'course_edition',
      entityId: 'e1',
      before: { startsAt: new Date('2026-06-01T12:00:00Z') },
      after: null,
      ip: '10.0.0.1',
      userAgent: 'x'.repeat(600),
      requestId: 'req-1',
    });
    expect(created).toEqual([
      {
        actorId: 'u1',
        actorRole: 'uta_admin',
        action: 'edition.update',
        entityType: 'course_edition',
        entityId: 'e1',
        before: { startsAt: '2026-06-01T12:00:00.000Z' },
        after: Prisma.DbNull,
        ip: '10.0.0.1',
        userAgent: 'x'.repeat(500),
        requestId: 'req-1',
      },
    ]);
  });

  it('writes into the given transaction instead of the default client', async () => {
    const outside = fakeDb();
    const transaction = fakeDb();
    await new PrismaAuditRecorder(outside.db).record(
      { actorId: null, actorRole: null, action: 'a', entityType: 't', entityId: null },
      transaction.db,
    );
    expect(outside.created).toHaveLength(0);
    expect(transaction.created).toHaveLength(1);
  });
});
