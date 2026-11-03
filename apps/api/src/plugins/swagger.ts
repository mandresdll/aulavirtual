import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export interface SwaggerOptions {
  version: string;
}

/** OpenAPI 3 generado desde los esquemas Zod de cada ruta. UI en `/api/docs`. */
export const swaggerPlugin = fp<SwaggerOptions>(
  async (app: FastifyInstance, options) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'API Plataforma de Cursos UTA',
          description:
            'API de difusión, venta e inscripción de cursos de la UTA del CFT Estatal de Magallanes.',
          version: options.version,
        },
        tags: [{ name: 'sistema', description: 'Salud y disponibilidad del servicio' }],
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  },
  { name: 'swagger' },
);
