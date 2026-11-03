import { Prisma } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import { AppError } from '../../lib/errors.js';
import type { AuditEntry } from '../../plugins/audit.js';
import { catalogCacheKeys } from '../catalog/catalog.service.js';

/** Actor y petición que se registran en la auditoría de cada cambio del panel. */
export type AuditActor = Pick<
  AuditEntry,
  'actorId' | 'actorRole' | 'ip' | 'userAgent' | 'requestId'
>;

/**
 * Invalida la caché pública del catálogo tras un cambio del panel, para que el sitio lo
 * muestre de inmediato: fichas afectadas, listados, destacados, áreas y sitemap.
 */
export class CatalogCacheInvalidator {
  constructor(private readonly cache: Cache) {}

  async coursesChanged(slugs: readonly string[]): Promise<void> {
    await this.cache.delete([
      ...new Set(slugs.map((slug) => catalogCacheKeys.course(slug))),
      catalogCacheKeys.featured,
      catalogCacheKeys.areas,
      catalogCacheKeys.sitemap,
    ]);
    await this.cache.deleteByPrefix(catalogCacheKeys.listPrefix);
  }
}

const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

function prismaCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

/**
 * Traduce errores de restricciones de la BD a respuestas para el usuario: valor repetido (409),
 * registro en uso (409) o inexistente (404).
 */
export function mapPrismaError(
  error: unknown,
  messages: { unique?: string; inUse?: string; notFound?: string },
): never {
  const code = prismaCode(error);
  if (code === UNIQUE_VIOLATION && messages.unique) {
    throw AppError.conflict('DUPLICATE', messages.unique);
  }
  if (code === FOREIGN_KEY_VIOLATION && messages.inUse) {
    throw AppError.conflict('IN_USE', messages.inUse);
  }
  if (code === RECORD_NOT_FOUND) {
    throw AppError.notFound(messages.notFound);
  }
  throw error;
}

export function paginate(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
