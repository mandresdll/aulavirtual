import {
  AdminLegalDocumentSchema,
  AdminLegalDocumentsResponseSchema,
  CurrentLegalDocumentsSchema,
  ErrorResponseSchema,
  LegalDocumentInputSchema,
  ProviderInfoSchema,
  type ProviderInfo,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { auditActor } from '../../plugins/audit.js';
import type { LegalService } from './legal.service.js';

export interface LegalRoutesOptions {
  legal: LegalService;
  provider: ProviderInfo;
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  409: ErrorResponseSchema,
};

/** Información al consumidor (RF-11): textos legales vigentes y datos del proveedor. */
export const legalRoutes: FastifyPluginAsyncZod<LegalRoutesOptions> = async (app, options) => {
  const { legal, provider } = options;

  app.get(
    '/legal',
    {
      config: { access: 'public' },
      schema: {
        tags: ['legal'],
        summary: 'Versión vigente de cada texto legal',
        response: { 200: CurrentLegalDocumentsSchema },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=60');
      return { items: await legal.current() };
    },
  );

  app.get(
    '/legal/provider',
    {
      config: { access: 'public' },
      schema: {
        tags: ['legal'],
        summary: 'Datos del proveedor (CFT) para el consumidor',
        response: { 200: ProviderInfoSchema },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return provider;
    },
  );

  app.get(
    '/admin/legal',
    {
      config: { access: { permission: 'legal:manage' } },
      schema: {
        tags: ['admin'],
        summary: 'Todas las versiones de los textos legales',
        response: { 200: AdminLegalDocumentsResponseSchema, ...errors },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', 'no-store');
      return { items: await legal.listAll() };
    },
  );

  app.post(
    '/admin/legal',
    {
      config: { access: { permission: 'legal:manage' } },
      schema: {
        tags: ['admin'],
        summary: 'Publica una versión nueva de un texto legal (no se puede modificar después)',
        body: LegalDocumentInputSchema,
        response: { 201: AdminLegalDocumentSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201).header('cache-control', 'no-store');
      return legal.publish(request.body, auditActor(request));
    },
  );
};
