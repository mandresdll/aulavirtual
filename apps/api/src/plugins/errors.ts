import type { ErrorResponse } from '@plataforma/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

const BAD_REQUEST = { code: 'BAD_REQUEST', message: 'La solicitud no es válida.' };
const NOT_FOUND = { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' };

const clientErrorMessages: Record<number, { code: string; message: string }> = {
  400: BAD_REQUEST,
  401: { code: 'UNAUTHORIZED', message: 'Debes iniciar sesión para continuar.' },
  403: { code: 'FORBIDDEN', message: 'No tienes permisos para realizar esta acción.' },
  404: NOT_FOUND,
  405: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'El contenido enviado es demasiado grande.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'El formato del contenido no es compatible.' },
  429: {
    code: 'RATE_LIMITED',
    message: 'Has realizado demasiadas solicitudes. Intenta nuevamente en unos minutos.',
  },
};

function body(requestId: string, code: string, message: string, details?: unknown): ErrorResponse {
  return {
    error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
  };
}

/**
 * Manejo uniforme de errores: formato `{ error: { code, message, details?, requestId } }`,
 * mensajes en español y sin filtrar detalles internos en errores 5xx.
 */
export const errorsPlugin = fp(
  async (app: FastifyInstance) => {
    app.setNotFoundHandler((request, reply) => {
      return reply.status(404).send(body(request.id, NOT_FOUND.code, NOT_FOUND.message));
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details = error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        }));
        return reply
          .status(400)
          .send(
            body(request.id, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', details),
          );
      }

      if (error instanceof AppError) {
        return reply
          .status(error.statusCode)
          .send(body(request.id, error.code, error.message, error.details));
      }

      const statusCode = error.statusCode ?? 500;
      if (statusCode < 500) {
        const known = clientErrorMessages[statusCode] ?? BAD_REQUEST;
        return reply.status(statusCode).send(body(request.id, known.code, known.message));
      }

      request.log.error({ err: error }, 'Unhandled error');
      return reply
        .status(500)
        .send(
          body(
            request.id,
            'INTERNAL_ERROR',
            'Ocurrió un error inesperado. Intenta nuevamente más tarde.',
          ),
        );
    });
  },
  { name: 'errors' },
);
