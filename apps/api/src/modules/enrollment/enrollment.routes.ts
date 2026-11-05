import {
  AdminEnrollmentsQuerySchema,
  AdminEnrollmentsResponseSchema,
  AdminWaitlistResponseSchema,
  EditionRequestSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  MyEnrollmentsSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditActor } from '../../plugins/audit.js';
import { requireAuth } from '../auth/access.plugin.js';
import type { EnrollmentService } from './enrollment.service.js';
import type { WaitlistService } from './waitlist.service.js';

export interface EnrollmentRoutesOptions {
  enrollment: EnrollmentService;
  waitlist: WaitlistService;
  rateLimit: { max: number; timeWindowMs: number };
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
};
const NoContent = z.null();
const MANAGE = { access: { permission: 'enrollments:manage' as const } };

/** Inscripción liberada, lista de espera y seguimiento de matrículas (RF-04, RF-05). */
export const enrollmentRoutes: FastifyPluginAsyncZod<EnrollmentRoutesOptions> = async (
  app,
  options,
) => {
  const { enrollment, waitlist } = options;
  const limited = { max: options.rateLimit.max, timeWindow: options.rateLimit.timeWindowMs };

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get(
    '/my/enrollments',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['inscripciones'],
        summary: 'Inscripciones y listas de espera del usuario',
        response: { 200: MyEnrollmentsSchema, ...errors },
      },
    },
    async (request) => enrollment.mine(requireAuth(request).userId),
  );

  app.post(
    '/enrollments/free',
    {
      config: { access: 'authenticated', rateLimit: limited },
      schema: {
        tags: ['inscripciones'],
        summary: 'Inscripción sin pago para la comunidad CFT',
        body: EditionRequestSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      await enrollment.enrollFree(
        { id: auth.userId, profiles: auth.profiles },
        request.body.editionId,
        auditActor(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/waitlist',
    {
      config: { access: 'authenticated', rateLimit: limited },
      schema: {
        tags: ['inscripciones'],
        summary: 'Se une a la lista de espera de una edición sin cupos',
        body: EditionRequestSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await waitlist.join(requireAuth(request).userId, request.body.editionId, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/waitlist/:editionId',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['inscripciones'],
        summary: 'Sale de la lista de espera',
        params: EditionRequestSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await waitlist.leave(
        requireAuth(request).userId,
        request.params.editionId,
        auditActor(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/admin/enrollments',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Inscripciones con matrícula fallida o pendiente',
        querystring: AdminEnrollmentsQuerySchema,
        response: { 200: AdminEnrollmentsResponseSchema, ...errors },
      },
    },
    async (request) => ({ items: await enrollment.list(request.query.status) }),
  );

  app.post(
    '/admin/enrollments/:id/retry',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Reintenta la matrícula de una inscripción fallida',
        params: IdParamsSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await enrollment.retry(request.params.id, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/admin/waitlist',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Personas en listas de espera',
        response: { 200: AdminWaitlistResponseSchema, ...errors },
      },
    },
    async () => ({ items: await waitlist.adminList() }),
  );
};
