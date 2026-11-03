import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export interface SecurityOptions {
  corsOrigins: string[];
}

/**
 * Cabeceras de seguridad (CSP, HSTS, etc.) y CORS restringido a los orígenes configurados.
 * La CSP del sitio público la define el servidor de la SPA; esta cubre las respuestas de la API
 * y la documentación OpenAPI.
 */
export const securityPlugin = fp<SecurityOptions>(
  async (app: FastifyInstance, options) => {
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          // HTTPS lo impone el proxy institucional con HSTS; en local (http) rompería /api/docs.
          upgradeInsecureRequests: null,
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    });

    await app.register(cors, {
      origin: options.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
  },
  { name: 'security' },
);
