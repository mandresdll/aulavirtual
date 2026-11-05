import { zodResolver } from '@hookform/resolvers/zod';
import {
  CERTIFICATE_STATUS_LABELS,
  formatDate,
  ReissueCertificateSchema,
  RevokeCertificateSchema,
  SYNC_STATUS_LABELS,
  type AdminCertificate,
  type ReissueCertificate,
  type RevokeCertificate,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import {
  ConfirmDialog,
  dangerButton,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  smallButton,
} from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import {
  useAdminCertificates,
  useCertificateAction,
  useManualResult,
  useResultsReview,
} from '../../lib/certificates';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Búsqueda, reemisión y revocación de certificados, y cursos sin nota por decidir (RF-06). */
export function CertificatesPage() {
  useDocumentTitle('Certificados · Administración');
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const certificates = useAdminCertificates(q);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand-800">Certificados</h1>

      <section aria-labelledby="certificados-busqueda" className="space-y-3">
        <h2 id="certificados-busqueda" className="text-lg font-semibold">
          Buscar certificados
        </h2>
        <form
          role="search"
          aria-label="Buscar certificados"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
            setMessage(null);
            setParams(value ? { q: value } : {});
          }}
        >
          <div className="min-w-60 flex-1">
            <label htmlFor="certificados-q" className="block text-sm font-medium">
              Código, correo o nombre
            </label>
            <input id="certificados-q" name="q" defaultValue={q} className={inputClass} />
          </div>
          <button type="submit" className={primaryButton}>
            Buscar
          </button>
        </form>
        <Feedback success={message} />
        {q.length > 0 && q.length < 3 && (
          <p className="text-ink-muted">Escribe al menos 3 caracteres.</p>
        )}
        {q.length >= 3 && certificates.isPending && <LoadingMessage />}
        {certificates.isError && <ErrorMessage error={certificates.error} />}
        {certificates.data?.items.length === 0 && (
          <p className="text-ink-muted">No encontramos certificados.</p>
        )}
        {certificates.data?.items.map((certificate) => (
          <CertificateCard key={certificate.id} certificate={certificate} onDone={setMessage} />
        ))}
      </section>

      <ReviewSection />
    </div>
  );
}

function CertificateCard({
  certificate,
  onDone,
}: {
  certificate: AdminCertificate;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<'reissue' | 'revoke' | null>(null);
  return (
    <article className="rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold">{certificate.code}</h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-ink-muted">Titular:</dt>
        <dd>
          {certificate.recipientName} ({certificate.email})
        </dd>
        <dt className="text-ink-muted">Curso:</dt>
        <dd>
          {certificate.courseTitle} · {certificate.editionCode}
        </dd>
        <dt className="text-ink-muted">Emitido:</dt>
        <dd>{formatDate(new Date(certificate.issuedAt))}</dd>
        <dt className="text-ink-muted">Estado:</dt>
        <dd>
          {CERTIFICATE_STATUS_LABELS[certificate.status]}
          {certificate.revocationReason && ` · ${certificate.revocationReason}`}
        </dd>
        <dt className="text-ink-muted">Validador SGA:</dt>
        <dd>
          {SYNC_STATUS_LABELS[certificate.validatorSyncStatus]}
          {certificate.validatorLastError && ` · ${certificate.validatorLastError}`}
        </dd>
      </dl>
      {certificate.status === 'valid' && mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={smallButton}
            aria-label={`Reemitir certificado ${certificate.code}`}
            onClick={() => setMode('reissue')}
          >
            Reemitir
          </button>
          <button
            type="button"
            className={dangerButton}
            aria-label={`Revocar certificado ${certificate.code}`}
            onClick={() => setMode('revoke')}
          >
            Revocar
          </button>
        </div>
      )}
      {mode === 'reissue' && (
        <ReissueForm
          certificate={certificate}
          onCancel={() => setMode(null)}
          onDone={(code) => onDone(`Certificado reemitido con el código ${code}.`)}
        />
      )}
      {mode === 'revoke' && (
        <RevokeForm
          certificate={certificate}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMode(null);
            onDone(`Certificado ${certificate.code} revocado.`);
          }}
        />
      )}
    </article>
  );
}

function ReissueForm({
  certificate,
  onCancel,
  onDone,
}: {
  certificate: AdminCertificate;
  onCancel: () => void;
  onDone: (code: string) => void;
}) {
  const action = useCertificateAction();
  const [pending, setPending] = useState<ReissueCertificate | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReissueCertificate>({
    resolver: zodResolver(ReissueCertificateSchema),
    defaultValues: { recipientName: certificate.recipientName },
  });
  return (
    <form onSubmit={handleSubmit(setPending)} noValidate className="mt-3 space-y-3">
      <Field label="Nombre corregido" error={errors.recipientName}>
        {(field) => <input {...field} className={inputClass} {...register('recipientName')} />}
      </Field>
      <Feedback error={action.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={action.isPending}>
          Reemitir
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={`¿Reemitir el certificado ${certificate.code}?`}
          description="Se crea un certificado con código nuevo y el actual queda reemplazado. No se puede deshacer."
          confirmLabel="Reemitir"
          onConfirm={() =>
            action.mutate(
              { type: 'reissue', id: certificate.id, ...pending },
              { onSuccess: (created) => onDone(created.code), onSettled: () => setPending(null) },
            )
          }
        />
      )}
    </form>
  );
}

function RevokeForm({
  certificate,
  onCancel,
  onDone,
}: {
  certificate: AdminCertificate;
  onCancel: () => void;
  onDone: () => void;
}) {
  const action = useCertificateAction();
  const [pending, setPending] = useState<RevokeCertificate | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RevokeCertificate>({
    resolver: zodResolver(RevokeCertificateSchema),
    defaultValues: { reason: '' },
  });
  return (
    <form onSubmit={handleSubmit(setPending)} noValidate className="mt-3 space-y-3">
      <Field label="Motivo de la revocación" error={errors.reason}>
        {(field) => <input {...field} className={inputClass} {...register('reason')} />}
      </Field>
      <Feedback error={action.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={action.isPending}>
          Revocar
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={`¿Revocar el certificado ${certificate.code}?`}
          description="El certificado dejará de ser válido en la verificación pública. No se puede deshacer."
          confirmLabel="Revocar"
          onConfirm={() =>
            action.mutate(
              { type: 'revoke', id: certificate.id, ...pending },
              { onSuccess: onDone, onSettled: () => setPending(null) },
            )
          }
        />
      )}
    </form>
  );
}

/** Cursos por nota que terminaron sin nota: la UTA decide el resultado. */
function ReviewSection() {
  const review = useResultsReview();
  const decide = useManualResult();
  return (
    <section aria-labelledby="certificados-revision" className="space-y-3">
      <h2 id="certificados-revision" className="text-lg font-semibold">
        Cursos sin nota por decidir
      </h2>
      <Feedback error={decide.error} />
      {review.isPending && <LoadingMessage />}
      {review.isError && <ErrorMessage error={review.error} />}
      {review.data?.items.length === 0 && (
        <p className="text-ink-muted">No hay inscripciones por decidir.</p>
      )}
      {review.data && review.data.items.length > 0 && (
        <ul className="space-y-2">
          {review.data.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
            >
              <div>
                <p className="font-medium">{item.user.name}</p>
                <p className="text-sm text-ink-muted">
                  {item.courseTitle} · {item.editionCode}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className={smallButton}
                      disabled={decide.isPending}
                      aria-label={`Aprobar a ${item.user.name}`}
                    >
                      Aprobar
                    </button>
                  }
                  title={`¿Aprobar a ${item.user.name}?`}
                  description="Se emite el certificado y se envía por correo."
                  confirmLabel="Aprobar"
                  onConfirm={() => decide.mutate({ id: item.id, result: 'completed' })}
                />
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className={dangerButton}
                      disabled={decide.isPending}
                      aria-label={`Reprobar a ${item.user.name}`}
                    >
                      Reprobar
                    </button>
                  }
                  title={`¿Reprobar a ${item.user.name}?`}
                  description="La inscripción queda como reprobada y no se emite certificado."
                  confirmLabel="Reprobar"
                  onConfirm={() => decide.mutate({ id: item.id, result: 'failed_course' })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
