import { DEFAULT_SITE_SETTINGS, SiteSettingsSchema, type SiteSettings } from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';

export interface SettingsServiceOptions {
  prisma: PrismaClient;
  audit: AuditRecorder;
  cache: Cache;
  ttlSeconds: number;
}

const KEY = 'site';
const CACHE_KEY = 'settings:site';

/** Textos y color del sitio, en la tabla `settings` (RF-07). */
export class SettingsService {
  constructor(private readonly options: SettingsServiceOptions) {}

  async get(): Promise<SiteSettings> {
    const { prisma, cache, ttlSeconds } = this.options;
    return cache.getOrSet(CACHE_KEY, ttlSeconds, async () => {
      const row = await prisma.setting.findUnique({ where: { key: KEY } });
      // Si el formato cambió entre versiones, se usan los valores por defecto.
      const stored = SiteSettingsSchema.safeParse(row?.value);
      return stored.success ? stored.data : DEFAULT_SITE_SETTINGS;
    });
  }

  async update(input: SiteSettings, actor: AuditActor): Promise<SiteSettings> {
    const { prisma, audit, cache } = this.options;
    const before = await this.get();
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: KEY },
        create: { key: KEY, value: input },
        update: { value: input },
      });
      await audit.record(
        {
          ...actor,
          action: 'settings.update',
          entityType: 'setting',
          entityId: KEY,
          before,
          after: input,
        },
        tx,
      );
    });
    await cache.delete([CACHE_KEY]);
    return input;
  }
}
