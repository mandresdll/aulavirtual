/**
 * Error de un sistema externo. `retryable` indica si conviene reintentar
 * (caída o timeout) o si el error es definitivo (datos rechazados).
 */
export class IntegrationError extends Error {
  constructor(
    public readonly integration: string,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'IntegrationError';
  }
}

/** Adaptador real cuyo contrato aún no está confirmado o cuya fase no ha llegado. */
export class AdapterNotImplementedError extends IntegrationError {
  constructor(integration: string, detail: string) {
    super(integration, 'NOT_IMPLEMENTED', `${integration}: ${detail}`);
    this.name = 'AdapterNotImplementedError';
  }
}
