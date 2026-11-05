import {
  AdminCampaignSchema,
  AdminCampaignsResponseSchema,
  AdminLeadsQuerySchema,
  AdminLeadsResponseSchema,
  CampaignInputSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  LeadRequestSchema,
  PageViewSchema,
  UnsubscribeParamsSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditActor } from '../../plugins/audit.js';
import type { CampaignsService } from './campaigns.service.js';
import type { LeadsService } from './leads.service.js';

export interface DiffusionRoutesOptions {
  leads: LeadsService;
  campaigns: CampaignsService;
  leadsRateLimit: { max: number; timeWindowMs: number };
  viewsRateLimit: { max: number; timeWindowMs: number };
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
};
const MANAGE = { access: { permission: 'diffusion:manage' as const } };
const SlugParamsSchema = z.object({ slug: z.string().min(1).max(200) });

/** Formulario de interés, bajas, visitas a fichas y novedades (RF-02). */
export const diffusionRoutes: FastifyPluginAsyncZod<DiffusionRoutesOptions> = async (
  app,
  options,
) => {
  const { leads, campaigns, leadsRateLimit, viewsRateLimit } = options;

  // Los clientes de correo piden la baja en un clic con un POST de formulario (RFC 8058).
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, _body, done) => {
      done(null, {});
    },
  );

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.post(
    '/leads',
    {
      config: {
        access: 'public',
        rateLimit: { max: leadsRateLimit.max, timeWindow: leadsRateLimit.timeWindowMs },
      },
      schema: {
        tags: ['difusion'],
        summary: 'Registra un interesado con consentimiento explícito',
        body: LeadRequestSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await leads.subscribe(request.body);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/leads/unsubscribe/:token',
    {
      config: {
        access: 'public',
        rateLimit: { max: leadsRateLimit.max, timeWindow: leadsRateLimit.timeWindowMs },
      },
      schema: {
        tags: ['difusion'],
        summary: 'Baja de las novedades en un clic',
        params: UnsubscribeParamsSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await leads.unsubscribe(request.params.token);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/courses/:slug/views',
    {
      config: {
        access: 'public',
        rateLimit: { max: viewsRateLimit.max, timeWindow: viewsRateLimit.timeWindowMs },
      },
      schema: {
        tags: ['difusion'],
        summary: 'Suma una visita a la ficha (contador sin datos personales)',
        params: SlugParamsSchema,
        body: PageViewSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await leads.recordView(request.params.slug, request.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/admin/leads',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Interesados con su consentimiento',
        querystring: AdminLeadsQuerySchema,
        response: { 200: AdminLeadsResponseSchema, ...errors },
      },
    },
    async (request) => leads.list(request.query),
  );

  app.get(
    '/admin/campaigns',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Novedades enviadas y audiencia actual',
        response: { 200: AdminCampaignsResponseSchema, ...errors },
      },
    },
    async () => campaigns.list(),
  );

  app.post(
    '/admin/campaigns',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Crea una novedad en borrador',
        body: CampaignInputSchema,
        response: { 201: AdminCampaignSchema, ...errors },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await campaigns.create(request.body, auditActor(request))),
  );

  app.post(
    '/admin/campaigns/:id/send',
    {
      config: MANAGE,
      schema: {
        tags: ['admin'],
        summary: 'Envía una novedad a quienes siguen suscritos',
        params: IdParamsSchema,
        response: { 200: AdminCampaignSchema, ...errors },
      },
    },
    async (request) => campaigns.send(request.params.id, auditActor(request)),
  );
};
