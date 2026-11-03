import { ApiError } from '../lib/api';

/** Mensaje de carga anunciado a lectores de pantalla. */
export function LoadingMessage({ children = 'Cargando…' }: { children?: string }) {
  return (
    <p role="status" className="py-8 text-center text-ink-muted">
      {children}
    </p>
  );
}

/** Error de la API con el mensaje en español que entrega el servidor y opción de reintentar. */
export function ErrorMessage({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : 'No pudimos cargar la información. Intenta nuevamente.';
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline">
          Reintentar
        </button>
      )}
    </div>
  );
}
