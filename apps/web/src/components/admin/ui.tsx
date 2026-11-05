import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useId, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';

/** Piezas comunes de los formularios y tablas del panel (accesibles: etiquetas y errores). */

export const inputClass =
  'mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-base text-ink focus:border-brand-700 aria-[invalid=true]:border-red-700';
export const primaryButton =
  'rounded-md bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-60';
export const secondaryButton =
  'rounded-md border border-brand-700 px-4 py-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60';
export const dangerButton =
  'rounded-md border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60';
export const smallButton =
  'rounded-md border border-gray-400 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-60';

interface FieldProps {
  label: string;
  /** Error de React Hook Form (o cualquier objeto con `message`). */
  error?: { message?: string | undefined } | undefined;
  hint?: string;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}

/** Campo con etiqueta, ayuda y mensaje de error asociados al control (WCAG 3.3.1, 1.3.1). */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error?.message && (
        <p id={errorId} className="mt-1 text-sm text-red-800">
          {error.message}
        </p>
      )}
    </div>
  );
}

/** Resultado de una acción, anunciado a lectores de pantalla. */
export function Feedback({ error, success }: { error?: unknown; success?: string | null }) {
  if (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'No se pudo completar la acción. Intenta nuevamente.';
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
        {message}
      </p>
    );
  }
  if (success) {
    return (
      <p
        role="status"
        className="rounded-md border border-green-200 bg-green-50 p-3 text-green-900"
      >
        {success}
      </p>
    );
  }
  return null;
}

interface ConfirmProps {
  /** Botón que abre el diálogo; sin él, se controla con `open`/`onOpenChange`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Confirmación accesible antes de una acción que no se puede deshacer (Radix AlertDialog). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
          <AlertDialog.Title className="text-lg font-bold text-ink">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-ink-muted">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel className={secondaryButton}>Cancelar</AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800"
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const statusColors: Record<string, string> = {
  published: 'bg-green-100 text-green-900',
  draft: 'bg-gray-100 text-gray-800',
  archived: 'bg-amber-100 text-amber-900',
  closed: 'bg-amber-100 text-amber-900',
  finished: 'bg-blue-100 text-blue-900',
  cancelled: 'bg-red-100 text-red-900',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status] ?? ''}`}
    >
      {label}
    </span>
  );
}
