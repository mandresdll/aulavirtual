import {
  AreasResponseSchema,
  CourseDetailSchema,
  CourseListQuerySchema,
  CourseListResponseSchema,
  ErrorResponseSchema,
  FeaturedCoursesResponseSchema,
  SlugSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { CatalogService } from './catalog.service.js';

export interface CatalogRoutesOptions {
  catalog: CatalogService;
}

/** Caché del navegador y del proxy: corta, para que los cupos se vean casi en tiempo real. */
const PUBLIC_CACHE = 'public, max-age=15';

/** API pública del catálogo (RF-01). Sin autenticación: solo muestra cursos publicados. */
export const catalogRoutes: FastifyPluginAsyncZod<CatalogRoutesOptions> = async (app, options) => {
  const { catalog } = options;

  app.get(
    '/catalog/courses',
    {
      config: { access: 'public' },
      schema: {
        tags: ['catálogo'],
        summary: 'Listado de cursos publicados con búsqueda, filtros y paginación',
        description:
          'Búsqueda de texto en español (sin distinguir tildes ni mayúsculas, por prefijo). ' +
          '`from` y `to` filtran por fecha de inicio de alguna edición, en hora de Punta Arenas.',
        querystring: CourseListQuerySchema,
        response: { 200: CourseListResponseSchema, 400: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', PUBLIC_CACHE);
      return catalog.listCourses(request.query);
    },
  );

  app.get(
    '/catalog/courses/featured',
    {
      config: { access: 'public' },
      schema: {
        tags: ['catálogo'],
        summary: 'Cursos destacados para la portada',
        response: { 200: FeaturedCoursesResponseSchema },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', PUBLIC_CACHE);
      return { items: await catalog.featuredCourses() };
    },
  );

  app.get(
    '/catalog/courses/:slug',
    {
      config: { access: 'public' },
      schema: {
        tags: ['catálogo'],
        summary: 'Ficha de un curso publicado con sus ediciones vigentes y cupos',
        params: z.object({ slug: SlugSchema }),
        response: { 200: CourseDetailSchema, 400: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const course = await catalog.getCourse(request.params.slug);
      if (!course) throw AppError.notFound('El curso no existe o no está disponible.');
      reply.header('cache-control', PUBLIC_CACHE);
      return course;
    },
  );

  app.get(
    '/catalog/areas',
    {
      config: { access: 'public' },
      schema: {
        tags: ['catálogo'],
        summary: 'Áreas con cursos publicados (para los filtros)',
        response: { 200: AreasResponseSchema },
      },
    },
    async (_request, reply) => {
      reply.header('cache-control', PUBLIC_CACHE);
      return { items: await catalog.listAreas() };
    },
  );
};
