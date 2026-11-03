import { primaryRole } from '@plataforma/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Entrada de auditoría (RF-12): quién, con qué rol, qué acción sobre qué entidad, el antes y el
 * después, desde qué IP y en qué petición. La fecha la pone la BD.
 */
export interface AuditEntry {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Cliente con acceso a `audit_logs`: el `PrismaClient` o una transacción en curso. */
export type AuditDb = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditRecorder {
  /**
   * Registra la entrada. Con `db` se escribe dentro de esa transacción: el cambio y su
   * auditoría se confirman o se descartan juntos.
   */
  record(entry: AuditEntry, db?: AuditDb): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditRecorder;
  }
}

const MAX_USER_AGENT = 500;

/** Valor JSON para la BD (fechas como texto ISO); `undefined` no se guarda. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Persiste en la tabla append-only `audit_logs` (UPDATE/DELETE/TRUNCATE bloqueados por trigger). */
export class PrismaAuditRecorder implements AuditRecorder {
  constructor(private readonly prisma: PrismaClient | AuditDb) {}

  async record(entry: AuditEntry, db: AuditDb = this.prisma): Promise<void> {
    const before = toJson(entry.before);
    const after = toJson(entry.after);
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }
}

/** Datos del actor y de la petición para una entrada de auditoría. */
export function auditActor(
  request: FastifyRequest,
): Pick<AuditEntry, 'actorId' | 'actorRole' | 'ip' | 'userAgent' | 'requestId'> {
  const userAgent = request.headers['user-agent'];
  return {
    actorId: request.auth?.userId ?? request.session?.userId ?? null,
    actorRole: request.auth ? primaryRole(request.auth.roles) : null,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {}),
    requestId: request.id,
  };
}

/**
 * Solo los campos que cambiaron, para que el antes/después de la auditoría sea un diff legible.
 * Compara por valor JSON (fechas, arreglos).
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const result = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      result.before[key] = before[key] ?? null;
      result.after[key] = after[key] ?? null;
    }
  }
  return result;
}

export const auditPlugin = fp<{ recorder: AuditRecorder }>(
  async (app: FastifyInstance, options) => {
    app.decorate('audit', options.recorder);
  },
  { name: 'audit' },
);
