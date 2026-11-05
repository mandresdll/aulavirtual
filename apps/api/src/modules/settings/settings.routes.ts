import { ErrorResponseSchema, SiteSettingsSchema } from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { auditActor } from '../../plugins/audit.js';
import type { SettingsService } from './settings.service.js';

export interface SettingsRoutesOptions {
  settings: SettingsService;
}

/** Configuración del sitio: lectura pública y edición desde el panel (RF-07). */
export const settingsRoutes: FastifyPluginAsyncZod<SettingsRoutesOptions> = async (
  app,
  options,
) => {
  const { settings } = options;

  app.get(
    '/settings',
    {
      config: { access: 'public' },
      schema: {
        tags: ['catalogo'],
        summary: 'Textos y color del sitio',
        response: { 200: SiteSettingsSchema },
      },
    },
    async () => settings.get(),
  );

  app.put(
    '/admin/settings',
    {
      config: { access: { permission: 'settings:manage' } },
      schema: {
        tags: ['admin'],
        summary: 'Actualiza los textos y el color del sitio',
        body: SiteSettingsSchema,
        response: {
          200: SiteSettingsSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => settings.update(request.body, auditActor(request)),
  );
};
