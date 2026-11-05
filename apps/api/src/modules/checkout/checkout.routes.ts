import {
  CartEditionSchema,
  CartMergeSchema,
  CartPreviewQuerySchema,
  CartResponseSchema,
  CreateOrderSchema,
  ErrorResponseSchema,
  IDEMPOTENCY_HEADER,
  OrderNumberParamsSchema,
  OrderSummarySchema,
  QuoteRequestSchema,
  QuoteSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { auditActor } from '../../plugins/audit.js';
import { requireAuth } from '../auth/access.plugin.js';
import type { CheckoutService } from './checkout.service.js';

export interface CheckoutRoutesOptions {
  checkout: CheckoutService;
  rateLimit: { max: number; timeWindowMs: number };
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
  503: ErrorResponseSchema,
};

const IdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,100}$/, 'Clave de idempotencia inválida');

/**
 * Carrito y checkout (RF-03, RF-04, RF-11). El carrito de un visitante vive en su navegador
 * (`/cart/preview` lo describe); con sesión se guarda en la BD y se fusiona al ingresar.
 */
export const checkoutRoutes: FastifyPluginAsyncZod<CheckoutRoutesOptions> = async (
  app,
  options,
) => {
  const { checkout } = options;
  const limited = { max: options.rateLimit.max, timeWindow: options.rateLimit.timeWindowMs };

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get(
    '/cart/preview',
    {
      config: { access: 'public' },
      schema: {
        tags: ['carrito'],
        summary: 'Describe el carrito de un visitante sin sesión (ids de edición)',
        querystring: CartPreviewQuerySchema,
        response: { 200: CartResponseSchema, 400: ErrorResponseSchema },
      },
    },
    async (request) => checkout.preview(request.query.editionIds),
  );

  app.get(
    '/cart',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['carrito'],
        summary: 'Carrito del usuario',
        response: { 200: CartResponseSchema, ...errors },
      },
    },
    async (request) => checkout.getCart(requireAuth(request).userId),
  );

  app.post(
    '/cart/items',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['carrito'],
        summary: 'Agrega una edición al carrito',
        body: CartEditionSchema,
        response: { 200: CartResponseSchema, ...errors },
      },
    },
    async (request) => checkout.addItem(requireAuth(request).userId, request.body.editionId),
  );

  app.delete(
    '/cart/items/:editionId',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['carrito'],
        summary: 'Quita una edición del carrito',
        params: CartEditionSchema,
        response: { 200: CartResponseSchema, ...errors },
      },
    },
    async (request) => checkout.removeItem(requireAuth(request).userId, request.params.editionId),
  );

  app.post(
    '/cart/merge',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['carrito'],
        summary: 'Fusiona el carrito del navegador al iniciar sesión',
        body: CartMergeSchema,
        response: { 200: CartResponseSchema, ...errors },
      },
    },
    async (request) => checkout.merge(requireAuth(request).userId, request.body.editionIds),
  );

  app.post(
    '/checkout/quote',
    {
      config: { access: 'authenticated', rateLimit: limited },
      schema: {
        tags: ['checkout'],
        summary: 'Cotiza el carrito con un cupón opcional y lista los textos legales vigentes',
        body: QuoteRequestSchema,
        response: { 200: QuoteSchema, ...errors },
      },
    },
    async (request) => checkout.quote(requireAuth(request).userId, request.body.couponCode),
  );

  app.post(
    '/checkout/orders',
    {
      config: { access: 'authenticated', rateLimit: limited },
      schema: {
        tags: ['checkout'],
        summary: 'Confirma la compra: crea la orden y reserva los cupos (idempotente)',
        description: `Requiere la cabecera \`${IDEMPOTENCY_HEADER}\`: un reintento con la misma clave devuelve la misma orden.`,
        body: CreateOrderSchema,
        response: { 200: OrderSummarySchema, 201: OrderSummarySchema, ...errors },
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const key = IdempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_HEADER]);
      if (!key.success) {
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'La solicitud no es válida. Recarga la página.',
        );
      }
      const actor = auditActor(request);
      const { order, created } = await checkout.createOrder(
        { id: auth.userId },
        request.body,
        key.data,
        { ...actor, ip: request.ip },
      );
      reply.status(created ? 201 : 200);
      return order;
    },
  );

  app.get(
    '/orders/:number',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['checkout'],
        summary: 'Resumen de una orden propia',
        params: OrderNumberParamsSchema,
        response: { 200: OrderSummarySchema, ...errors },
      },
    },
    async (request) => checkout.getOrder(requireAuth(request).userId, request.params.number),
  );
};
