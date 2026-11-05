import {
  ErrorResponseSchema,
  ReportExportQuerySchema,
  ReportQuerySchema,
  ReportSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sendTable } from '../../lib/tabular.js';
import type { ReportsService } from './reports.service.js';

export interface ReportsRoutesOptions {
  reports: ReportsService;
}

const READ = { access: { permission: 'reports:read' as const } };

/** Reportes y sus descargas (RF-09). */
export const reportsRoutes: FastifyPluginAsyncZod<ReportsRoutesOptions> = async (app, options) => {
  const { reports } = options;

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get(
    '/admin/reports',
    {
      config: READ,
      schema: {
        tags: ['admin'],
        summary: 'Ventas, inscritos, aprobación, certificados y conversión del período',
        querystring: ReportQuerySchema,
        response: {
          200: ReportSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request) => reports.build(request.query),
  );

  app.get(
    '/admin/reports/export',
    {
      config: READ,
      schema: {
        tags: ['admin'],
        summary: 'Descarga un reporte en CSV o XLSX',
        querystring: ReportExportQuerySchema,
      },
    },
    async (request, reply) =>
      sendTable(reply, await reports.table(request.query), request.query.format),
  );
};
