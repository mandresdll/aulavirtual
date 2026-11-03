import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Entrada de auditoría (RF-12). En la Fase 2 se persiste en la tabla append-only `audit_logs`;
 * por ahora solo se define el contrato y se registra en el log estructurado.
 */
export interface AuditEntry {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export interface AuditRecorder {
  record(entry: AuditEntry): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditRecorder;
  }
}

export const auditPlugin = fp(
  async (app: FastifyInstance) => {
    const recorder: AuditRecorder = {
      async record(entry) {
        app.log.info(
          {
            audit: { action: entry.action, entityType: entry.entityType, entityId: entry.entityId },
          },
          'audit',
        );
      },
    };
    app.decorate('audit', recorder);
  },
  { name: 'audit' },
);
