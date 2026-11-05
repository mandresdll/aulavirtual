import {
  AdminDocumentSchema,
  DocumentExportSchema,
  DocumentsQuerySchema,
  DocumentsResponseSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  ReconciliationResponseSchema,
  ReconciliationRunSchema,
  RegisterFolioSchema,
  ResolveDiscrepancySchema,
  RunReconciliationSchema,
  SalesExportQuerySchema,
  SalesQuerySchema,
  SalesResponseSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sendTable } from '../../lib/tabular.js';
import { auditActor } from '../../plugins/audit.js';
import type { DocumentsService } from './documents.service.js';
import type { ReconciliationService } from './reconciliation.service.js';
import type { SalesService } from './sales.service.js';

export interface SalesRoutesOptions {
  sales: SalesService;
  documents: DocumentsService;
  reconciliation: ReconciliationService;
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
};
const MANAGE = { access: { permission: 'sales:manage' as const } };
const tags = ['admin'];

/** Ventas, documentos y conciliación (RF-08). */
export const salesRoutes: FastifyPluginAsyncZod<SalesRoutesOptions> = async (app, options) => {
  const { sales, documents, reconciliation } = options;

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get(
    '/admin/sales',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Ventas con filtros',
        querystring: SalesQuerySchema,
        response: { 200: SalesResponseSchema, ...errors },
      },
    },
    async (request) => sales.list(request.query),
  );

  app.get(
    '/admin/sales/export',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Descarga las ventas filtradas en CSV o XLSX',
        querystring: SalesExportQuerySchema,
      },
    },
    async (request, reply) =>
      sendTable(reply, await sales.table(request.query), request.query.format),
  );

  app.get(
    '/admin/documents',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Boletas y facturas con su estado y folio',
        querystring: DocumentsQuerySchema,
        response: { 200: DocumentsResponseSchema, ...errors },
      },
    },
    async (request) => documents.list(request.query),
  );

  app.post(
    '/admin/documents/export',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Genera el archivo contable del período y registra la exportación',
        body: DocumentExportSchema,
      },
    },
    async (request, reply) =>
      sendTable(
        reply,
        await documents.exportFile(request.body, auditActor(request)),
        request.body.format,
      ),
  );

  app.post(
    '/admin/documents/:id/folio',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Registra el folio entregado por el sistema de emisión',
        params: IdParamsSchema,
        body: RegisterFolioSchema,
        response: { 200: AdminDocumentSchema, ...errors },
      },
    },
    async (request) =>
      documents.registerFolio(request.params.id, request.body, auditActor(request)),
  );

  app.post(
    '/admin/documents/:id/retry',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Reintenta un documento rechazado',
        params: IdParamsSchema,
        response: { 200: AdminDocumentSchema, ...errors },
      },
    },
    async (request) => documents.retry(request.params.id, auditActor(request)),
  );

  app.get(
    '/admin/reconciliation',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Última conciliación y diferencias sin resolver',
        response: { 200: ReconciliationResponseSchema, ...errors },
      },
    },
    async () => reconciliation.overview(),
  );

  app.post(
    '/admin/reconciliation',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Concilia ahora un día con la pasarela',
        body: RunReconciliationSchema,
        response: { 200: ReconciliationRunSchema, ...errors },
      },
    },
    async (request) => reconciliation.run(request.body.day),
  );

  app.post(
    '/admin/reconciliation/:id/resolve',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Marca una diferencia como resuelta',
        params: IdParamsSchema,
        body: ResolveDiscrepancySchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await reconciliation.resolve(request.params.id, request.body.note, auditActor(request));
      return reply.status(204).send(null);
    },
  );
};
