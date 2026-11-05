import {
  AdminOrderSchema,
  ErrorResponseSchema,
  IDEMPOTENCY_HEADER,
  OrderNumberParamsSchema,
  PaymentReturnSchema,
  RefundRequestSchema,
  StartPaymentResponseSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { auditActor } from '../../plugins/audit.js';
import { requireAuth } from '../auth/access.plugin.js';
import type { PaymentsService } from './payments.service.js';
import type { ReceiptsService } from './receipts.service.js';
import type { RefundsService } from './refunds.service.js';

export interface PaymentsRoutesOptions {
  payments: PaymentsService;
  receipts: ReceiptsService;
  refunds: RefundsService;
  rateLimit: { max: number; timeWindowMs: number };
}

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  429: ErrorResponseSchema,
  502: ErrorResponseSchema,
  503: ErrorResponseSchema,
};

const IdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);

/** Pago de órdenes, comprobante y devoluciones (RF-03). */
export const paymentsRoutes: FastifyPluginAsyncZod<PaymentsRoutesOptions> = async (
  app,
  options,
) => {
  const { payments, receipts, refunds } = options;
  const limited = { max: options.rateLimit.max, timeWindow: options.rateLimit.timeWindowMs };

  // Webpay puede volver por POST con un formulario. Solo se acepta en este módulo.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  app.post(
    '/orders/:number/pay',
    {
      config: { access: 'authenticated', rateLimit: limited },
      schema: {
        tags: ['pagos'],
        summary: 'Inicia un intento de pago y devuelve adónde enviar al comprador',
        params: OrderNumberParamsSchema,
        response: { 200: StartPaymentResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      return payments.start(
        requireAuth(request).userId,
        request.params.number,
        auditActor(request),
      );
    },
  );

  const returnConfig = {
    config: { access: 'public' as const },
    schema: { tags: ['pagos'], summary: 'Retorno del comprador desde la pasarela' },
  };

  app.get(
    '/payments/return',
    { ...returnConfig, schema: { ...returnConfig.schema, querystring: PaymentReturnSchema } },
    async (request, reply) => reply.redirect(await payments.handleReturn(request.query), 303),
  );

  app.post(
    '/payments/return',
    { ...returnConfig, schema: { ...returnConfig.schema, body: PaymentReturnSchema } },
    async (request, reply) => reply.redirect(await payments.handleReturn(request.body), 303),
  );

  app.get(
    '/orders/:number/receipt',
    {
      config: { access: 'authenticated' },
      schema: {
        tags: ['pagos'],
        summary: 'Comprobante PDF de una orden pagada propia',
        params: OrderNumberParamsSchema,
      },
    },
    async (request, reply) => {
      const pdf = await receipts.pdfFor(requireAuth(request).userId, request.params.number);
      return reply
        .header('cache-control', 'no-store')
        .header(
          'content-disposition',
          `attachment; filename="comprobante-${request.params.number}.pdf"`,
        )
        .type('application/pdf')
        .send(Buffer.from(pdf));
    },
  );

  app.get(
    '/admin/orders/:number',
    {
      config: { access: { permission: 'orders:refund' } },
      schema: {
        tags: ['admin'],
        summary: 'Orden con pagos, devoluciones e historial',
        params: OrderNumberParamsSchema,
        response: { 200: AdminOrderSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      return refunds.adminOrder(request.params.number);
    },
  );

  app.post(
    '/admin/orders/:number/refunds',
    {
      config: { access: { permission: 'orders:refund' } },
      schema: {
        tags: ['admin'],
        summary: 'Devuelve un monto total o parcial por la pasarela (idempotente)',
        params: OrderNumberParamsSchema,
        body: RefundRequestSchema,
        response: { 200: AdminOrderSchema, ...errors },
      },
    },
    async (request, reply) => {
      const key = IdempotencyKeySchema.safeParse(request.headers[IDEMPOTENCY_HEADER]);
      if (!key.success) {
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'La solicitud no es válida. Recarga la página.',
        );
      }
      reply.header('cache-control', 'no-store');
      return refunds.refund(request.params.number, request.body, key.data, auditActor(request));
    },
  );
};
