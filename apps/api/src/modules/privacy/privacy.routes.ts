import {
  DataSubjectRequestSchema,
  DataSubjectSummarySchema,
  ErrorResponseSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditActor } from '../../plugins/audit.js';
import type { PrivacyService } from './privacy.service.js';

export interface PrivacyRoutesOptions {
  privacy: PrivacyService;
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
};
const MANAGE = { access: { permission: 'privacy:manage' as const } };
const tags = ['admin'];

/** Solicitudes de titulares de datos. Son POST para que el correo no viaje en la URL. */
export const privacyRoutes: FastifyPluginAsyncZod<PrivacyRoutesOptions> = async (app, options) => {
  const { privacy } = options;

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.post(
    '/admin/data-subjects/search',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Resumen de los datos de un titular',
        body: DataSubjectRequestSchema,
        response: { 200: DataSubjectSummarySchema, ...errors },
      },
    },
    async (request) => privacy.summary(request.body.email),
  );

  app.post(
    '/admin/data-subjects/export',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Descarga los datos de un titular (derecho de acceso)',
        body: DataSubjectRequestSchema,
      },
    },
    async (request, reply) => {
      const data = await privacy.exportData(request.body.email, auditActor(request));
      return reply
        .header('content-disposition', 'attachment; filename="datos-personales.json"')
        .type('application/json; charset=utf-8')
        .send(JSON.stringify(data, null, 2));
    },
  );

  app.post(
    '/admin/data-subjects/anonymize',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Anonimiza a un titular (derecho de supresión)',
        body: DataSubjectRequestSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await privacy.anonymize(request.body.email, auditActor(request));
      return reply.status(204).send(null);
    },
  );
};
