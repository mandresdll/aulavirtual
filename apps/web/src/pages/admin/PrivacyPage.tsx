import { DataSubjectRequestSchema, type DataSubjectSummary } from '@plataforma/shared';
import { useState } from 'react';
import {
  ConfirmDialog,
  dangerButton,
  Feedback,
  inputClass,
  secondaryButton,
} from '../../components/admin/ui';
import { useAnonymizeSubject, useExportSubject, useSubjectSearch } from '../../lib/privacy';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Solicitudes de acceso y supresión de datos personales (Leyes 19.628 y 21.719). */
export function PrivacyPage() {
  useDocumentTitle('Datos personales · Administración');
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const search = useSubjectSearch();

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Datos personales</h1>
      <p className="mt-1 text-ink-muted">
        Atiende las solicitudes de acceso y supresión. Verifica antes la identidad de quien lo pide.
        Cada acción queda en la auditoría.
      </p>

      <form
        noValidate
        role="search"
        aria-label="Buscar titular"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          const parsed = DataSubjectRequestSchema.safeParse({ email: value });
          setInvalid(parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Inválido'));
          if (!parsed.success) return;
          setEmail(parsed.data.email);
          search.mutate(parsed.data.email);
        }}
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="titular-correo" className="block text-sm font-medium">
            Correo del titular
          </label>
          <input
            id="titular-correo"
            type="email"
            value={value}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? 'titular-error' : undefined}
            className={inputClass}
            onChange={(event) => setValue(event.target.value)}
          />
          {invalid && (
            <p id="titular-error" className="mt-1 text-sm text-red-800">
              {invalid}
            </p>
          )}
        </div>
        <button type="submit" className={secondaryButton} disabled={search.isPending}>
          Buscar
        </button>
      </form>

      <div className="mt-4">
        <Feedback error={search.error} success={message} />
        {search.data && email && !message && (
          <Subject
            email={email}
            summary={search.data}
            onDone={() => setMessage('Los datos fueron anonimizados.')}
          />
        )}
      </div>
    </div>
  );
}

function Subject({
  email,
  summary,
  onDone,
}: {
  email: string;
  summary: DataSubjectSummary;
  onDone: () => void;
}) {
  const download = useExportSubject();
  const anonymize = useAnonymizeSubject();
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-labelledby="titular" className="space-y-3">
      <h2 id="titular" className="text-lg font-semibold">
        {summary.name ?? 'Solo interesado, sin cuenta'}
      </h2>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Órdenes</dt>
        <dd>{summary.orders}</dd>
        <dt className="text-ink-muted">Inscripciones</dt>
        <dd>{summary.enrollments}</dd>
        <dt className="text-ink-muted">Certificados</dt>
        <dd>{summary.certificates}</dd>
        <dt className="text-ink-muted">Registros de interés</dt>
        <dd>{summary.leads}</dd>
      </dl>
      {summary.blockedReason && (
        <p role="alert" className="text-red-800">
          {summary.blockedReason}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={download.isPending}
          onClick={() => download.mutate(email)}
        >
          Descargar sus datos
        </button>
        <button
          type="button"
          className={dangerButton}
          disabled={summary.blockedReason !== null}
          onClick={() => setConfirming(true)}
        >
          Anonimizar
        </button>
      </div>
      <Feedback error={download.error ?? anonymize.error} />
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(false)}
          title="¿Anonimizar a esta persona?"
          description="Se borran su nombre, correo, RUT y registros de interés, y no se puede deshacer. Las ventas se conservan sin esos datos y los certificados emitidos mantienen el nombre impreso."
          confirmLabel="Anonimizar"
          onConfirm={() =>
            anonymize.mutate(email, { onSuccess: onDone, onSettled: () => setConfirming(false) })
          }
        />
      )}
    </section>
  );
}
