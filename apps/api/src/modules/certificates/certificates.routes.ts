import {
  AdminCertificateSchema,
  AdminCertificatesQuerySchema,
  AdminCertificatesResponseSchema,
  AdminEnrollmentsResponseSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  ManualResultSchema,
  MyCoursesSchema,
  ReissueCertificateSchema,
  RevokeCertificateSchema,
  SyncResultsResponseSchema,
  VerificationSchema,
  VerifyParamsSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditActor } from '../../plugins/audit.js';
import { requireAuth } from '../auth/access.plugin.js';
import type { CertificatesService } from './certificates.service.js';

export interface CertificatesRoutesOptions {
  certificates: CertificatesService;
  verifyRateLimit: { max: number; timeWindowMs: number };
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
};
const MANAGE = { access: { permission: 'certificates:manage' as const } };
const tags = ['certificados'];

/** Verificación pública, «Mis cursos» y gestión de certificados (RF-06). */
export const certificatesRoutes: FastifyPluginAsyncZod<CertificatesRoutesOptions> = async (
  app,
  options,
) => {
  const { certificates, verifyRateLimit } = options;

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get(
    '/verify/:code',
    {
      config: {
        access: 'public',
        rateLimit: { max: verifyRateLimit.max, timeWindow: verifyRateLimit.timeWindowMs },
      },
      schema: {
        tags,
        summary: 'Verificación pública de un certificado',
        params: VerifyParamsSchema,
        response: { 200: VerificationSchema, 400: ErrorResponseSchema, 429: ErrorResponseSchema },
      },
    },
    async (request) => certificates.verify(request.params.code),
  );

  app.get(
    '/my/courses',
    {
      config: { access: 'authenticated' },
      schema: {
        tags,
        summary: 'Cursos del usuario con su estado y certificado',
        response: { 200: MyCoursesSchema, ...errors },
      },
    },
    async (request) => certificates.myCourses(requireAuth(request).userId),
  );

  app.get(
    '/my/certificates/:code/pdf',
    {
      config: { access: 'authenticated' },
      schema: {
        tags,
        summary: 'Descarga un certificado vigente propio',
        params: VerifyParamsSchema,
      },
    },
    async (request, reply) => {
      const { code, pdf } = await certificates.pdfFor(
        requireAuth(request).userId,
        request.params.code,
      );
      return reply
        .header('content-disposition', `attachment; filename="certificado-${code}.pdf"`)
        .type('application/pdf')
        .send(Buffer.from(pdf));
    },
  );

  app.get(
    '/admin/certificates',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Busca certificados por código, correo o nombre',
        querystring: AdminCertificatesQuerySchema,
        response: { 200: AdminCertificatesResponseSchema, ...errors },
      },
    },
    async (request) => ({ items: await certificates.search(request.query.q) }),
  );

  app.post(
    '/admin/certificates/:id/reissue',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Reemite un certificado con el nombre corregido',
        params: IdParamsSchema,
        body: ReissueCertificateSchema,
        response: { 200: AdminCertificateSchema, ...errors },
      },
    },
    async (request) =>
      certificates.reissue(request.params.id, request.body.recipientName, auditActor(request)),
  );

  app.post(
    '/admin/certificates/:id/revoke',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Revoca un certificado con motivo',
        params: IdParamsSchema,
        body: RevokeCertificateSchema,
        response: { 200: AdminCertificateSchema, ...errors },
      },
    },
    async (request) =>
      certificates.revoke(request.params.id, request.body.reason, auditActor(request)),
  );

  app.get(
    '/admin/enrollments/review',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Inscripciones de cursos por nota sin nota, pasado el plazo',
        response: { 200: AdminEnrollmentsResponseSchema, ...errors },
      },
    },
    async () => ({ items: await certificates.needsReview() }),
  );

  app.post(
    '/admin/enrollments/:id/result',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Decide a mano el resultado de una inscripción',
        params: IdParamsSchema,
        body: ManualResultSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await certificates.decide(request.params.id, request.body.result, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/admin/editions/:id/sync-results',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Consulta ahora la aprobación de una edición en el Aula Virtual',
        params: IdParamsSchema,
        response: { 200: SyncResultsResponseSchema, ...errors },
      },
    },
    async (request) => certificates.syncResults(request.params.id),
  );
};
