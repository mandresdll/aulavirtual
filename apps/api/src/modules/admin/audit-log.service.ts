import {
  nextIsoDate,
  startOfLocalDay,
  type AuditListResponse,
  type AuditQuery,
} from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { paginate } from './support.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vista de auditoría de solo lectura (RF-12): filtros por fecha local, actor, acción y entidad. */
export class AuditLogService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AuditQuery): Promise<AuditListResponse> {
    const createdAt: Prisma.DateTimeFilter = {
      ...(query.from ? { gte: startOfLocalDay(query.from) } : {}),
      ...(query.to ? { lt: startOfLocalDay(nextIsoDate(query.to)) } : {}),
    };
    const where: Prisma.AuditLogWhereInput = {
      ...(query.from || query.to ? { createdAt } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const actorIds = [
      ...new Set(
        rows.map((row) => row.actorId).filter((id): id is string => !!id && UUID.test(id)),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(actors.map((actor) => [actor.id, actor.name]));

    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        actorId: row.actorId,
        actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
      ...paginate(query.page, query.pageSize, total),
    };
  }
}
