import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatDateTime,
  fromLocalDateTimeInput,
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENT_TYPES,
  LegalDocumentInputSchema,
  toLocalDateTimeInput,
  type AdminLegalDocument,
  type LegalDocumentInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ConfirmDialog,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  StatusBadge,
} from '../../components/admin/ui';
import { Markdown } from '../../components/Markdown';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminLegal, usePublishLegal } from '../../lib/admin';
import { validateWith } from '../../lib/forms';
import { useDocumentTitle } from '../../lib/use-document-title';

const LegalFormSchema = z
  .object({
    type: z.enum(LEGAL_DOCUMENT_TYPES),
    version: z.string(),
    title: z.string(),
    content: z.string(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indica fecha y hora'),
  })
  .transform((form) => ({
    ...form,
    effectiveFrom: fromLocalDateTimeInput(form.effectiveFrom).toISOString(),
  }))
  .transform(validateWith(LegalDocumentInputSchema));
type LegalForm = z.input<typeof LegalFormSchema>;

/**
 * Textos legales versionados (RF-11). Una versión publicada no se modifica: para cambiar un
 * texto se publica una versión nueva (se puede partir de la vigente) con su fecha de vigencia.
 */
export function LegalAdminPage() {
  useDocumentTitle('Textos legales · Administración');
  const legal = useAdminLegal();
  const [draftFrom, setDraftFrom] = useState<AdminLegalDocument | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Textos legales</h1>
        {draftFrom === null && (
          <button type="button" className={primaryButton} onClick={() => setDraftFrom('new')}>
            Nueva versión
          </button>
        )}
      </div>
      <p className="mt-1 text-ink-muted">
        Las versiones publicadas no se pueden modificar: cada orden guarda la versión aceptada.
      </p>

      <div className="mt-4 space-y-4">
        <Feedback success={message} />
        {draftFrom !== null && (
          <LegalEditor
            key={draftFrom === 'new' ? 'new' : draftFrom.id}
            base={draftFrom === 'new' ? null : draftFrom}
            onDone={(text) => {
              setDraftFrom(null);
              setMessage(text);
            }}
          />
        )}

        {legal.isPending && <LoadingMessage />}
        {legal.isError && <ErrorMessage error={legal.error} onRetry={() => void legal.refetch()} />}
        {legal.data &&
          LEGAL_DOCUMENT_TYPES.map((type) => {
            const versions = legal.data.items.filter((item) => item.type === type);
            return (
              <section
                key={type}
                aria-labelledby={`legal-${type}`}
                className="rounded-lg border border-gray-200 p-4"
              >
                <h2 id={`legal-${type}`} className="text-lg font-semibold">
                  {LEGAL_DOCUMENT_LABELS[type]}
                </h2>
                {versions.length === 0 ? (
                  <p className="mt-2 text-sm text-red-800">
                    Sin versión publicada: la compra en línea no está disponible hasta publicarla.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {versions.map((version) => (
                      <li key={version.id} className="flex flex-wrap items-center gap-3">
                        <span className="font-medium">Versión {version.version}</span>
                        <span className="text-ink-muted">
                          vigente desde {formatDateTime(new Date(version.effectiveFrom))}
                        </span>
                        {version.current && <StatusBadge status="published" label="Vigente" />}
                        {!version.current && Date.parse(version.effectiveFrom) > Date.now() && (
                          <StatusBadge status="draft" label="Programada" />
                        )}
                        <button
                          type="button"
                          className="text-brand-700 underline"
                          onClick={() => {
                            setMessage(null);
                            setDraftFrom(version);
                          }}
                        >
                          Nueva versión a partir de esta
                          <span className="sr-only">
                            {' '}
                            ({LEGAL_DOCUMENT_LABELS[type]}, versión {version.version})
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}

function LegalEditor({
  base,
  onDone,
}: {
  base: AdminLegalDocument | null;
  onDone: (message: string | null) => void;
}) {
  const publish = usePublishLegal();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LegalForm, unknown, LegalDocumentInput>({
    resolver: zodResolver(LegalFormSchema),
    defaultValues: {
      type: base?.type ?? 'terms',
      version: '',
      title: base?.title ?? '',
      content: base?.content ?? '',
      effectiveFrom: toLocalDateTimeInput(new Date()),
    },
  });
  const content = watch('content');
  const [pending, setPending] = useState<LegalDocumentInput | null>(null);

  return (
    <form
      noValidate
      aria-label="Nueva versión de texto legal"
      onSubmit={handleSubmit((input) => setPending(input))}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold sm:col-span-2">Nueva versión</h2>
      <Field label="Documento" error={errors.type}>
        {(props) => (
          <select {...props} className={inputClass} {...register('type')}>
            {LEGAL_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {LEGAL_DOCUMENT_LABELS[type]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Versión" hint="Ej.: 2026.1 (no se puede repetir)" error={errors.version}>
        {(props) => <input {...props} className={inputClass} {...register('version')} />}
      </Field>
      <Field label="Título" error={errors.title}>
        {(props) => <input {...props} className={inputClass} {...register('title')} />}
      </Field>
      <Field label="Vigente desde" hint="Hora de Punta Arenas" error={errors.effectiveFrom}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('effectiveFrom')}
          />
        )}
      </Field>
      <Field
        label="Contenido"
        hint="Formato Markdown: ## para títulos, - para listas, **negrita**. No se admite HTML."
        error={errors.content}
        className="sm:col-span-2"
      >
        {(props) => (
          <textarea
            {...props}
            rows={14}
            className={`${inputClass} font-mono text-sm`}
            {...register('content')}
          />
        )}
      </Field>
      <section
        aria-labelledby="vista-previa"
        className="rounded-md border border-gray-200 bg-white p-4 sm:col-span-2"
      >
        <h3 id="vista-previa" className="text-sm font-semibold text-ink-muted">
          Vista previa
        </h3>
        <Markdown source={content} className="mt-2" />
      </section>
      <div className="sm:col-span-2">
        <Feedback error={publish.error} />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className={primaryButton} disabled={publish.isPending}>
          Publicar versión
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone(null)}>
          Cancelar
        </button>
      </div>
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={`¿Publicar la versión ${pending.version}?`}
          description="Una vez publicada no se puede modificar ni eliminar. Desde su fecha de vigencia, los compradores deberán aceptarla."
          confirmLabel="Publicar"
          onConfirm={() =>
            publish.mutate(pending, {
              onSuccess: (saved) =>
                onDone(
                  `Se publicó la versión ${saved.version} de ${LEGAL_DOCUMENT_LABELS[saved.type]}.`,
                ),
              onSettled: () => setPending(null),
            })
          }
        />
      )}
    </form>
  );
}
