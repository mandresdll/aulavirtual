import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { MockPaymentGateway } from '../../integrations/payment-gateway/mock.js';

const returnLink = (params: Record<string, string>) =>
  `/api/payments/return?${new URLSearchParams(params).toString()}`;

/**
 * Página de la pasarela simulada (solo con `PAYMENT_GATEWAY_DRIVER=mock`, bloqueado en producción
 * por la configuración). Imita los tres finales de Webpay: aprobar, rechazar y anular.
 */
export const mockPaymentRoutes: FastifyPluginAsyncZod<{ gateway: MockPaymentGateway }> = async (
  app,
  options,
) => {
  const TokenQuery = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

  app.get(
    '/dev/mock-payment',
    {
      config: { access: 'public' },
      schema: {
        tags: ['desarrollo'],
        summary: 'Pasarela simulada: elegir el resultado del pago',
        querystring: TokenQuery,
      },
    },
    async (request, reply) => {
      const { token } = request.query;
      reply.header('cache-control', 'no-store').type('text/html; charset=utf-8');
      return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pasarela de pagos simulada</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1f1f1f; }
  li { margin: 0.75rem 0; }
  a { font-weight: 600; color: #7a1f2b; }
  p.note { background: #fff4d6; padding: 0.75rem; border-radius: 0.25rem; }
</style>
</head>
<body>
<main>
<h1>Pasarela de pagos simulada</h1>
<p class="note">Solo para desarrollo y pruebas: no se realiza ningún cobro.</p>
<ul>
<li><a href="/api/dev/mock-payment/decide?outcome=approved&amp;token=${token}">Aprobar el pago</a></li>
<li><a href="/api/dev/mock-payment/decide?outcome=rejected&amp;token=${token}">Rechazar el pago</a></li>
<li><a href="${returnLink({ TBK_TOKEN: token }).replace('&', '&amp;')}">Anular y volver al comercio</a></li>
</ul>
</main>
</body>
</html>`;
    },
  );

  app.get(
    '/dev/mock-payment/decide',
    {
      config: { access: 'public' },
      schema: {
        tags: ['desarrollo'],
        summary: 'Pasarela simulada: aplica el resultado y vuelve al comercio',
        querystring: TokenQuery.extend({ outcome: z.enum(['approved', 'rejected']) }),
      },
    },
    async (request, reply) => {
      const { token, outcome } = request.query;
      options.gateway.simulate(token, outcome);
      return reply.redirect(returnLink({ token_ws: token }), 303);
    },
  );
};
