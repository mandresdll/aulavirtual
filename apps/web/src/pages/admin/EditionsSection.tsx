import { zodResolver } from '@hookform/resolvers/zod';
import {
  COMMUNITY_PROFILES,
  EDITION_STATUS_LABELS,
  EditionCodeSchema,
  EditionInputSchema,
  formatClp,
  formatDateTime,
  fromLocalDateTimeInput,
  PASSING_CRITERIA,
  PASSING_CRITERION_LABELS,
  TAX_TREATMENT_LABELS,
  TAX_TREATMENTS,
  toLocalDateTimeInput,
  type AdminCourseDetail,
  type AdminEdition,
  type EditionInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ConfirmDialog,
  dangerButton,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  smallButton,
  StatusBadge,
} from '../../components/admin/ui';
import { useEditionAction, useSaveEdition, type EditionAction } from '../../lib/admin';
import { useSyncResults } from '../../lib/certificates';
import { validateWith } from '../../lib/forms';

const PROFILE_LABELS: Record<(typeof COMMUNITY_PROFILES)[number], string> = {
  student: 'Estudiantes',
  teacher: 'Docentes',
  staff: 'Funcionarios',
};

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const localDateTime = z.string().regex(LOCAL_DATE_TIME, 'Indica fecha y hora');
const toIso = (value: string) => fromLocalDateTimeInput(value).toISOString();
const nanToNull = (value: unknown) =>
  typeof value === 'number' && Number.isNaN(value) ? null : value;

/**
 * Las fechas se ingresan en hora de Punta Arenas (`datetime-local`) y se envían en UTC;
 * luego se validan con el mismo esquema que usa la API.
 */
const EditionFormSchema = z
  .object({
    code: z.string(),
    startsAt: localDateTime,
    endsAt: localDateTime,
    enrollmentOpensAt: z.union([z.literal(''), localDateTime]),
    enrollmentClosesAt: localDateTime,
    capacity: z.number(),
    priceClp: z.number(),
    taxTreatment: z.enum(TAX_TREATMENTS),
    schedule: z.string(),
    location: z.string(),
    moodleCourseId: z.string(),
    passingCriterion: z.enum(PASSING_CRITERIA),
    passingGrade: z.preprocess(nanToNull, z.number().nullable()),
    certificateTemplate: z.string(),
    freeForCommunity: z.boolean(),
    communityProfiles: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(z.enum(COMMUNITY_PROFILES)),
    ),
  })
  .transform((form) => ({
    ...form,
    startsAt: toIso(form.startsAt),
    endsAt: toIso(form.endsAt),
    enrollmentOpensAt: form.enrollmentOpensAt ? toIso(form.enrollmentOpensAt) : null,
    enrollmentClosesAt: toIso(form.enrollmentClosesAt),
  }))
  .transform(validateWith(EditionInputSchema));
type EditionForm = z.input<typeof EditionFormSchema>;

const local = (iso: string | null) => (iso ? toLocalDateTimeInput(new Date(iso)) : '');

function toForm(edition: AdminEdition | null): EditionForm {
  return {
    code: edition?.code ?? '',
    startsAt: local(edition?.startsAt ?? null),
    endsAt: local(edition?.endsAt ?? null),
    enrollmentOpensAt: local(edition?.enrollmentOpensAt ?? null),
    enrollmentClosesAt: local(edition?.enrollmentClosesAt ?? null),
    capacity: edition?.capacity ?? 20,
    priceClp: edition?.priceClp ?? 0,
    taxTreatment: edition?.taxTreatment ?? 'exempt',
    schedule: edition?.schedule ?? '',
    location: edition?.location ?? '',
    moodleCourseId: edition?.moodleCourseId ?? '',
    passingCriterion: edition?.passingCriterion ?? 'completion',
    passingGrade: edition?.passingGrade ?? null,
    certificateTemplate: edition?.certificateTemplate ?? '',
    freeForCommunity: edition?.freeForCommunity ?? false,
    communityProfiles: edition?.communityProfiles ?? [],
  };
}

const ACTION_DONE: Record<EditionAction['type'], string> = {
  publish: 'La edición está publicada.',
  unpublish: 'La edición volvió a borrador.',
  duplicate: 'Se creó la copia como borrador.',
  delete: 'Se eliminó la edición.',
};

/** Ediciones del curso: fechas, cupos, precio y publicación (RF-07). */
export function EditionsSection({ course }: { course: AdminCourseDetail }) {
  const action = useEditionAction();
  const [editing, setEditing] = useState<AdminEdition | 'new' | null>(null);
  const [duplicating, setDuplicating] = useState<AdminEdition | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sync = useSyncResults();
  const syncResults = (id: string) => {
    setMessage(null);
    sync.mutate(id, {
      onSuccess: ({ checked, completed, failed }) =>
        setMessage(
          `Inscripciones consultadas: ${checked}. Aprobadas: ${completed}. Reprobadas: ${failed}.`,
        ),
    });
  };

  const run = (input: EditionAction) => {
    setMessage(null);
    action.mutate(input, {
      onSuccess: () => {
        setMessage(ACTION_DONE[input.type]);
        setDuplicating(null);
      },
    });
  };

  return (
    <section aria-labelledby="ediciones-titulo" className="mt-10 border-t border-gray-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ediciones-titulo" className="text-xl font-bold text-brand-800">
          Ediciones
        </h2>
        {editing === null && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setMessage(null);
              setEditing('new');
            }}
          >
            Nueva edición
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <Feedback error={action.error ?? sync.error} success={message} />
        {editing !== null && (
          <EditionEditor
            key={editing === 'new' ? 'new' : editing.id}
            courseId={course.id}
            edition={editing === 'new' ? null : editing}
            onDone={(text) => {
              setEditing(null);
              setMessage(text);
            }}
          />
        )}
        {duplicating && (
          <DuplicateForm
            edition={duplicating}
            pending={action.isPending}
            onCancel={() => setDuplicating(null)}
            onSubmit={(code) => run({ type: 'duplicate', id: duplicating.id, code })}
          />
        )}

        {course.editions.length === 0 ? (
          <p className="text-ink-muted">Este curso aún no tiene ediciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Ediciones de {course.title}</caption>
              <thead className="border-b border-gray-300">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Código
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Inicio
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Precio
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Cupos
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Estado
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {course.editions.map((edition) => (
                  <tr key={edition.id} className="border-b border-gray-200 align-top">
                    <td className="py-2 pr-4 font-medium">
                      {edition.code}
                      {!edition.moodleCourseId && (
                        <span className="block text-xs font-normal text-red-800">
                          Sin curso del Aula Virtual: no se podrá matricular
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{formatDateTime(new Date(edition.startsAt))}</td>
                    <td className="py-2 pr-4">
                      {edition.freeForCommunity && edition.priceClp === 0
                        ? 'Liberado'
                        : formatClp(edition.priceClp)}
                    </td>
                    <td className="py-2 pr-4">
                      {edition.enrollmentCount} / {edition.capacity}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        status={edition.status}
                        label={EDITION_STATUS_LABELS[edition.status]}
                      />
                    </td>
                    <td className="flex flex-wrap gap-2 py-2">
                      <button
                        type="button"
                        className={smallButton}
                        aria-label={`Editar edición ${edition.code}`}
                        onClick={() => {
                          setMessage(null);
                          setEditing(edition);
                        }}
                      >
                        Editar
                      </button>
                      {edition.status === 'draft' && (
                        <button
                          type="button"
                          className={smallButton}
                          aria-label={`Publicar edición ${edition.code}`}
                          disabled={action.isPending}
                          onClick={() => run({ type: 'publish', id: edition.id })}
                        >
                          Publicar
                        </button>
                      )}
                      {(edition.status === 'published' || edition.status === 'closed') && (
                        <button
                          type="button"
                          className={smallButton}
                          aria-label={`Despublicar edición ${edition.code}`}
                          disabled={action.isPending}
                          onClick={() => run({ type: 'unpublish', id: edition.id })}
                        >
                          Despublicar
                        </button>
                      )}
                      <button
                        type="button"
                        className={smallButton}
                        aria-label={`Duplicar edición ${edition.code}`}
                        onClick={() => {
                          setMessage(null);
                          setDuplicating(edition);
                        }}
                      >
                        Duplicar
                      </button>
                      {edition.moodleCourseId && edition.enrollmentCount > 0 && (
                        <button
                          type="button"
                          className={smallButton}
                          aria-label={`Sincronizar aprobación de ${edition.code}`}
                          disabled={sync.isPending}
                          onClick={() => syncResults(edition.id)}
                        >
                          Sincronizar aprobación
                        </button>
                      )}
                      {edition.status === 'draft' && edition.enrollmentCount === 0 && (
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              className={dangerButton}
                              aria-label={`Eliminar edición ${edition.code}`}
                            >
                              Eliminar
                            </button>
                          }
                          title={`¿Eliminar la edición ${edition.code}?`}
                          description="Solo se eliminan borradores sin inscripciones, órdenes ni reservas. Esta acción no se puede deshacer."
                          confirmLabel="Eliminar edición"
                          onConfirm={() => run({ type: 'delete', id: edition.id })}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function DuplicateForm({
  edition,
  pending,
  onCancel,
  onSubmit,
}: {
  edition: AdminEdition;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (code: string) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ code: string }>({
    resolver: zodResolver(z.object({ code: EditionCodeSchema })),
    defaultValues: { code: '' },
  });
  return (
    <form
      noValidate
      aria-label={`Duplicar edición ${edition.code}`}
      onSubmit={handleSubmit(({ code }) => onSubmit(code))}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4"
    >
      <Field
        label={`Código de la copia de ${edition.code}`}
        hint="La copia queda como borrador con las mismas condiciones. Revisa sus fechas."
        error={errors.code}
        className="min-w-60 flex-1"
      >
        {(props) => <input {...props} className={inputClass} {...register('code')} />}
      </Field>
      <button type="submit" className={primaryButton} disabled={pending}>
        Duplicar
      </button>
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}

function EditionEditor({
  courseId,
  edition,
  onDone,
}: {
  courseId: string;
  edition: AdminEdition | null;
  onDone: (message: string | null) => void;
}) {
  const save = useSaveEdition();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EditionForm, unknown, EditionInput>({
    resolver: zodResolver(EditionFormSchema),
    defaultValues: toForm(edition),
  });
  const criterion = watch('passingCriterion');
  const freeForCommunity = watch('freeForCommunity');

  return (
    <form
      noValidate
      aria-label={edition ? `Editar edición ${edition.code}` : 'Nueva edición'}
      onSubmit={handleSubmit((input) =>
        save.mutate(
          { courseId, ...(edition ? { id: edition.id } : {}), input },
          { onSuccess: (saved) => onDone(`Se guardó la edición ${saved.code}.`) },
        ),
      )}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <h3 className="text-lg font-semibold sm:col-span-2 lg:col-span-4">
        {edition ? `Editar edición ${edition.code}` : 'Nueva edición'}
      </h3>
      <p className="text-sm text-ink-muted sm:col-span-2 lg:col-span-4">
        Fechas y horas en hora de Punta Arenas.
      </p>
      <Field label="Código" hint="Ej.: JS-2026-1" error={errors.code}>
        {(props) => <input {...props} className={inputClass} {...register('code')} />}
      </Field>
      <Field label="Cupos" error={errors.capacity}>
        {(props) => (
          <input
            {...props}
            type="number"
            min={0}
            className={inputClass}
            {...register('capacity', { valueAsNumber: true })}
          />
        )}
      </Field>
      <Field label="Precio (CLP)" hint="Pesos, sin puntos ni decimales." error={errors.priceClp}>
        {(props) => (
          <input
            {...props}
            type="number"
            min={0}
            step={1}
            className={inputClass}
            {...register('priceClp', { valueAsNumber: true })}
          />
        )}
      </Field>
      <Field label="Tratamiento tributario" error={errors.taxTreatment}>
        {(props) => (
          <select {...props} className={inputClass} {...register('taxTreatment')}>
            {TAX_TREATMENTS.map((value) => (
              <option key={value} value={value}>
                {TAX_TREATMENT_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Inicio" error={errors.startsAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('startsAt')}
          />
        )}
      </Field>
      <Field label="Término" error={errors.endsAt}>
        {(props) => (
          <input {...props} type="datetime-local" className={inputClass} {...register('endsAt')} />
        )}
      </Field>
      <Field label="Apertura de inscripciones (opcional)" error={errors.enrollmentOpensAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('enrollmentOpensAt')}
          />
        )}
      </Field>
      <Field label="Cierre de inscripciones" error={errors.enrollmentClosesAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('enrollmentClosesAt')}
          />
        )}
      </Field>
      <Field label="Horario (opcional)" error={errors.schedule} className="sm:col-span-2">
        {(props) => <input {...props} className={inputClass} {...register('schedule')} />}
      </Field>
      <Field label="Lugar (opcional)" error={errors.location} className="sm:col-span-2">
        {(props) => <input {...props} className={inputClass} {...register('location')} />}
      </Field>
      <Field label="Curso en el Aula Virtual (id Moodle, opcional)" error={errors.moodleCourseId}>
        {(props) => <input {...props} className={inputClass} {...register('moodleCourseId')} />}
      </Field>
      <Field label="Criterio de aprobación" error={errors.passingCriterion}>
        {(props) => (
          <select {...props} className={inputClass} {...register('passingCriterion')}>
            {PASSING_CRITERIA.map((value) => (
              <option key={value} value={value}>
                {PASSING_CRITERION_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {criterion === 'grade' && (
        <Field label="Nota mínima" error={errors.passingGrade}>
          {(props) => (
            <input
              {...props}
              type="number"
              step="0.1"
              className={inputClass}
              {...register('passingGrade', { valueAsNumber: true })}
            />
          )}
        </Field>
      )}
      <Field label="Plantilla de certificado (opcional)" error={errors.certificateTemplate}>
        {(props) => (
          <input {...props} className={inputClass} {...register('certificateTemplate')} />
        )}
      </Field>

      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="text-sm font-medium">Inscripción liberada (RF-04)</legend>
        <label className="mt-1 flex items-center gap-2">
          <input type="checkbox" {...register('freeForCommunity')} />
          Sin pago para la comunidad CFT
        </label>
        {freeForCommunity && (
          <div className="mt-2 flex flex-wrap gap-4">
            {COMMUNITY_PROFILES.map((profile) => (
              <label key={profile} className="flex items-center gap-2">
                <input type="checkbox" value={profile} {...register('communityProfiles')} />
                {PROFILE_LABELS[profile]}
              </label>
            ))}
          </div>
        )}
        {errors.communityProfiles?.message && (
          <p className="mt-1 text-sm text-red-800">{errors.communityProfiles.message}</p>
        )}
      </fieldset>

      <div className="sm:col-span-2 lg:col-span-4">
        <Feedback error={save.error} />
      </div>
      <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Guardar edición
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone(null)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
