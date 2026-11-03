/**
 * Error de aplicación con código estable y mensaje para el usuario en español de Chile.
 * Todo error que deba mostrarse al cliente se lanza como `AppError`.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }

  static notFound(message = 'El recurso solicitado no existe.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static forbidden(message = 'No tienes permisos para realizar esta acción.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static unauthorized(message = 'Debes iniciar sesión para continuar.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static conflict(code: string, message: string) {
    return new AppError(409, code, message);
  }
}
