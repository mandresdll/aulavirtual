import { createHash } from 'node:crypto';
import {
  LEGAL_DOCUMENT_TYPES,
  type AdminLegalDocument,
  type LegalDocument,
  type LegalDocumentInput,
  type LegalDocumentType,
} from '@plataforma/shared';
import type { LegalDocument as LegalRow, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import { mapPrismaError, type AuditActor } from '../admin/support.js';

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function toPublic(row: LegalRow): LegalDocument {
  return {
    type: row.type,
    version: row.version,
    title: row.title,
    content: row.content,
    contentSha256: row.contentSha256,
    effectiveFrom: row.effectiveFrom.toISOString(),
  };
}

/** Hash de la aceptación: los hashes de los textos aceptados, en orden fijo de tipo. */
export function acceptanceHash(
  documents: readonly Pick<LegalDocument, 'type' | 'contentSha256'>[],
) {
  const byType = new Map(documents.map((document) => [document.type, document.contentSha256]));
  return sha256(LEGAL_DOCUMENT_TYPES.map((type) => `${type}:${byType.get(type) ?? ''}`).join('\n'));
}

/**
 * Textos legales versionados (RF-11). Una versión no se modifica (trigger en la BD): un cambio es
 * una versión nueva con su fecha de vigencia. Rige la última versión cuya vigencia ya empezó.
 */
export class LegalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditRecorder,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Versión vigente de cada tipo (los tipos sin versión publicada se omiten). */
  async current(): Promise<LegalDocument[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: { effectiveFrom: { lte: this.now() } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const byType = new Map<LegalDocumentType, LegalRow>();
    for (const row of rows) if (!byType.has(row.type)) byType.set(row.type, row);
    return LEGAL_DOCUMENT_TYPES.flatMap((type) => {
      const row = byType.get(type);
      return row ? [toPublic(row)] : [];
    });
  }

  async listAll(): Promise<AdminLegalDocument[]> {
    const [rows, current] = await Promise.all([
      this.prisma.legalDocument.findMany({
        orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      }),
      this.current(),
    ]);
    const currentKeys = new Set(current.map((doc) => `${doc.type}:${doc.version}`));
    return rows.map((row) => ({
      ...toPublic(row),
      id: row.id,
      current: currentKeys.has(`${row.type}:${row.version}`),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async publish(input: LegalDocumentInput, actor: AuditActor): Promise<AdminLegalDocument> {
    const effectiveFrom = new Date(input.effectiveFrom);
    const row = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.legalDocument.create({
          data: { ...input, effectiveFrom, contentSha256: sha256(input.content) },
        });
        await this.audit.record(
          {
            ...actor,
            action: 'legal.publish',
            entityType: 'legal_document',
            entityId: created.id,
            after: {
              type: created.type,
              version: created.version,
              title: created.title,
              contentSha256: created.contentSha256,
              effectiveFrom: created.effectiveFrom.toISOString(),
            },
          },
          tx,
        );
        return created;
      })
      .catch((error: unknown) =>
        mapPrismaError(error, {
          unique: 'Ya existe esa versión para este texto. Usa un número de versión nuevo.',
        }),
      );
    const current = await this.current();
    return {
      ...toPublic(row),
      id: row.id,
      current: current.some((doc) => doc.type === row.type && doc.version === row.version),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Textos vigentes que se deben aceptar; error si falta alguno (no se puede vender). */
  async requiredForCheckout(): Promise<LegalDocument[]> {
    const current = await this.current();
    if (current.length !== LEGAL_DOCUMENT_TYPES.length) {
      throw new AppError(
        503,
        'LEGAL_NOT_CONFIGURED',
        'La compra en línea no está disponible: faltan textos legales publicados.',
      );
    }
    return current;
  }
}
