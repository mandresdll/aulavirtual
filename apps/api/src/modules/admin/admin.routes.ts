import {
  AdminAreaSchema,
  AdminAreasResponseSchema,
  AdminCourseDetailSchema,
  AdminCourseListQuerySchema,
  AdminCourseListResponseSchema,
  AdminEditionSchema,
  AdminInstructorSchema,
  AdminInstructorsResponseSchema,
  AreaInputSchema,
  AuditListResponseSchema,
  AuditQuerySchema,
  CourseInputSchema,
  DuplicateEditionInputSchema,
  EditionInputSchema,
  ErrorResponseSchema,
  IdParamsSchema,
  InstructorInputSchema,
} from '@plataforma/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { auditActor } from '../../plugins/audit.js';
import type { RouteAccess } from '../auth/access.plugin.js';
import type { AdminAreasService, AdminInstructorsService } from './areas.service.js';
import type { AuditLogService } from './audit-log.service.js';
import type { AdminCoursesService } from './courses.service.js';

export interface AdminRoutesOptions {
  areas: AdminAreasService;
  instructors: AdminInstructorsService;
  courses: AdminCoursesService;
  auditLog: AuditLogService;
}

const MANAGE: { access: RouteAccess } = { access: { permission: 'catalog:manage' } };
const AUDIT: { access: RouteAccess } = { access: { permission: 'audit:read' } };

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
};
const NoContent = z.null();
const tags = ['admin'];

/**
 * API del panel de administración (RF-07 parcial) y de la vista de auditoría (RF-12).
 * Todas las rutas exigen sesión y permiso; las mutaciones, además, el token CSRF.
 */
export const adminRoutes: FastifyPluginAsyncZod<AdminRoutesOptions> = async (app, options) => {
  const { areas, instructors, courses, auditLog } = options;

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
  });

  // --- Áreas -------------------------------------------------------------------------------

  app.get(
    '/admin/areas',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Áreas con su cantidad de cursos',
        response: { 200: AdminAreasResponseSchema, ...errors },
      },
    },
    async () => ({ items: await areas.list() }),
  );

  app.post(
    '/admin/areas',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Crea un área',
        body: AreaInputSchema,
        response: { 201: AdminAreaSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201);
      return areas.create(request.body, auditActor(request));
    },
  );

  app.put(
    '/admin/areas/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Modifica un área',
        params: IdParamsSchema,
        body: AreaInputSchema,
        response: { 200: AdminAreaSchema, ...errors },
      },
    },
    async (request) => areas.update(request.params.id, request.body, auditActor(request)),
  );

  app.delete(
    '/admin/areas/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Elimina un área sin cursos',
        params: IdParamsSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await areas.delete(request.params.id, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  // --- Docentes ----------------------------------------------------------------------------

  app.get(
    '/admin/instructors',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Docentes con su cantidad de cursos',
        response: { 200: AdminInstructorsResponseSchema, ...errors },
      },
    },
    async () => ({ items: await instructors.list() }),
  );

  app.post(
    '/admin/instructors',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Crea un docente',
        body: InstructorInputSchema,
        response: { 201: AdminInstructorSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201);
      return instructors.create(request.body, auditActor(request));
    },
  );

  app.put(
    '/admin/instructors/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Modifica un docente',
        params: IdParamsSchema,
        body: InstructorInputSchema,
        response: { 200: AdminInstructorSchema, ...errors },
      },
    },
    async (request) => instructors.update(request.params.id, request.body, auditActor(request)),
  );

  app.delete(
    '/admin/instructors/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Elimina un docente que no está en cursos',
        params: IdParamsSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await instructors.delete(request.params.id, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  // --- Cursos ------------------------------------------------------------------------------

  app.get(
    '/admin/courses',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Cursos en todos los estados, con búsqueda y paginación',
        querystring: AdminCourseListQuerySchema,
        response: { 200: AdminCourseListResponseSchema, ...errors },
      },
    },
    async (request) => courses.list(request.query),
  );

  app.get(
    '/admin/courses/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Curso con todas sus ediciones',
        params: IdParamsSchema,
        response: { 200: AdminCourseDetailSchema, ...errors },
      },
    },
    async (request) => courses.get(request.params.id),
  );

  app.post(
    '/admin/courses',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Crea un curso (como borrador)',
        body: CourseInputSchema,
        response: { 201: AdminCourseDetailSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201);
      return courses.create(request.body, auditActor(request));
    },
  );

  app.put(
    '/admin/courses/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Modifica un curso',
        params: IdParamsSchema,
        body: CourseInputSchema,
        response: { 200: AdminCourseDetailSchema, ...errors },
      },
    },
    async (request) => courses.update(request.params.id, request.body, auditActor(request)),
  );

  const courseStatusRoutes = [
    { path: 'publish', status: 'published', summary: 'Publica el curso en el catálogo' },
    { path: 'unpublish', status: 'draft', summary: 'Despublica el curso (vuelve a borrador)' },
    { path: 'archive', status: 'archived', summary: 'Archiva el curso (no se borra)' },
  ] as const;
  for (const { path, status, summary } of courseStatusRoutes) {
    app.post(
      `/admin/courses/:id/${path}`,
      {
        config: MANAGE,
        schema: {
          tags,
          summary,
          params: IdParamsSchema,
          response: { 200: AdminCourseDetailSchema, ...errors },
        },
      },
      async (request) => courses.setStatus(request.params.id, status, auditActor(request)),
    );
  }

  // --- Ediciones ---------------------------------------------------------------------------

  app.post(
    '/admin/courses/:id/editions',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Crea una edición del curso (como borrador)',
        params: IdParamsSchema,
        body: EditionInputSchema,
        response: { 201: AdminEditionSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201);
      return courses.createEdition(request.params.id, request.body, auditActor(request));
    },
  );

  app.put(
    '/admin/editions/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Modifica una edición (fechas, cupos, precio…)',
        params: IdParamsSchema,
        body: EditionInputSchema,
        response: { 200: AdminEditionSchema, ...errors },
      },
    },
    async (request) => courses.updateEdition(request.params.id, request.body, auditActor(request)),
  );

  const editionStatusRoutes = [
    { path: 'publish', status: 'published', summary: 'Publica la edición' },
    { path: 'unpublish', status: 'draft', summary: 'Despublica la edición (vuelve a borrador)' },
  ] as const;
  for (const { path, status, summary } of editionStatusRoutes) {
    app.post(
      `/admin/editions/:id/${path}`,
      {
        config: MANAGE,
        schema: {
          tags,
          summary,
          params: IdParamsSchema,
          response: { 200: AdminEditionSchema, ...errors },
        },
      },
      async (request) => courses.setEditionStatus(request.params.id, status, auditActor(request)),
    );
  }

  app.post(
    '/admin/editions/:id/duplicate',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Duplica la edición como borrador con un código nuevo',
        params: IdParamsSchema,
        body: DuplicateEditionInputSchema,
        response: { 201: AdminEditionSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.status(201);
      return courses.duplicateEdition(request.params.id, request.body.code, auditActor(request));
    },
  );

  app.delete(
    '/admin/editions/:id',
    {
      config: MANAGE,
      schema: {
        tags,
        summary: 'Elimina una edición en borrador sin uso',
        params: IdParamsSchema,
        response: { 204: NoContent, ...errors },
      },
    },
    async (request, reply) => {
      await courses.deleteEdition(request.params.id, auditActor(request));
      return reply.status(204).send(null);
    },
  );

  // --- Auditoría (solo lectura) ------------------------------------------------------------

  app.get(
    '/admin/audit',
    {
      config: AUDIT,
      schema: {
        tags,
        summary: 'Registro de auditoría con filtros (solo lectura)',
        querystring: AuditQuerySchema,
        response: { 200: AuditListResponseSchema, ...errors },
      },
    },
    async (request) => auditLog.list(request.query),
  );
};
