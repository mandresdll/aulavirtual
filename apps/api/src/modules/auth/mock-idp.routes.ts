import { PLATFORM_ROLE_LABELS } from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MOCK_IDENTITIES } from '../../integrations/mock-identities.js';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

function callbackLink(params: Record<string, string>): string {
  return `/api/auth/callback?${new URLSearchParams(params).toString()}`;
}

/**
 * Página del IdP simulado (solo con `IDENTITY_DRIVER=mock`, bloqueado en producción por la
 * configuración): elige una identidad de demostración y vuelve al callback con su `subject`
 * como código. No envía datos: son enlaces.
 */
export const mockIdpRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/dev/mock-idp/authorize',
    {
      config: { access: 'public' },
      schema: {
        tags: ['desarrollo'],
        summary: 'IdP simulado: selección de usuario de demostración',
        querystring: z.object({ state: z.string().min(1).max(200) }),
      },
    },
    async (request, reply) => {
      const { state } = request.query;
      const items = MOCK_IDENTITIES.map((identity) => {
        const roles = identity.platformRoles.map((role) => PLATFORM_ROLE_LABELS[role]).join(', ');
        return `<li><a href="${escapeHtml(callbackLink({ code: identity.subject, state }))}">${escapeHtml(identity.name)}</a>
          <span>${escapeHtml(identity.email)} · ${escapeHtml(roles)}</span></li>`;
      }).join('\n');

      reply.header('cache-control', 'no-store').type('text/html; charset=utf-8');
      return `<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Proveedor de identidad simulado</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1f1f1f; }
  li { margin: 0.75rem 0; }
  a { font-weight: 600; color: #7a1f2b; }
  span { display: block; font-size: 0.9rem; color: #555; }
  p.note { background: #fff4d6; padding: 0.75rem; border-radius: 0.25rem; }
</style>
</head>
<body>
<main>
<h1>Proveedor de identidad simulado</h1>
<p class="note">Solo para desarrollo y pruebas. En producción se ingresa con la cuenta institucional.</p>
<h2>Elige un usuario de demostración</h2>
<ul>
${items}
</ul>
<p><a href="${escapeHtml(callbackLink({ error: 'access_denied', state }))}">Cancelar</a></p>
</main>
</body>
</html>`;
    },
  );
};
