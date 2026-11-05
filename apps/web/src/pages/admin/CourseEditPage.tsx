import { zodResolver } from '@hookform/resolvers/zod';
import {
  COURSE_STATUS_LABELS,
  CourseInputSchema,
  MODALITIES,
  MODALITY_LABELS,
  type AdminCourseDetail,
  type CourseInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CoursePreview } from '../../components/admin/CoursePreview';
import { Link, useNavigate, useParams } from 'react-router';
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
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import {
  useAdminAreas,
  useAdminCourse,
  useAdminInstructors,
  useCourseStatus,
  useSaveCourse,
  type CourseStatusAction,
} from '../../lib/admin';
import { linesToList, listToLines, validateWith } from '../../lib/forms';
import { useDocumentTitle } from '../../lib/use-document-title';
import { EditionsSection } from './EditionsSection';

/** El formulario edita objetivos y contenidos como texto (una línea por elemento). */
const CourseFormSchema = CourseInputSchema.omit({ objectives: true, contents: true })
  .extend({ objectivesText: z.string(), contentsText: z.string() })
  .transform(({ objectivesText, contentsText, ...course }) => ({
    ...course,
    objectives: linesToList(objectivesText),
    contents: linesToList(contentsText),
  }))
  .transform(validateWith(CourseInputSchema));
type CourseForm = z.input<typeof CourseFormSchema>;

function toForm(course: AdminCourseDetail | undefined): CourseForm {
  return {
    slug: course?.slug ?? '',
    title: course?.title ?? '',
    summary: course?.summary ?? '',
    description: course?.description ?? '',
    objectivesText: listToLines(course?.objectives ?? []),
    contentsText: listToLines(course?.contents ?? []),
    requirements: course?.requirements ?? '',
    certificationInfo: course?.certificationInfo ?? '',
    modality: course?.modality ?? 'online',
    durationHours: course?.durationHours ?? 1,
    areaId: course?.areaId ?? '',
    imageUrl: course?.imageUrl ?? '',
    imageAlt: course?.imageAlt ?? '',
    featured: course?.featured ?? false,
    seoTitle: course?.seoTitle ?? '',
    seoDescription: course?.seoDescription ?? '',
    instructorIds: course?.instructorIds ?? [],
  };
}

/** Crear o editar un curso y sus ediciones (RF-07). */
export function CourseEditPage() {
  const { id } = useParams();
  const course = useAdminCourse(id);
  useDocumentTitle(id ? 'Editar curso · Administración' : 'Nuevo curso · Administración');

  if (id && course.isPending) return <LoadingMessage />;
  if (id && course.isError) {
    return <ErrorMessage error={course.error} onRetry={() => void course.refetch()} />;
  }
  return <CourseEditor key={course.data?.id ?? 'new'} course={course.data} />;
}

const STATUS_ACTIONS: Record<CourseStatusAction, { label: string; done: string }> = {
  publish: { label: 'Publicar', done: 'El curso está publicado en el catálogo.' },
  unpublish: { label: 'Despublicar', done: 'El curso volvió a borrador y ya no se muestra.' },
  archive: { label: 'Archivar', done: 'El curso quedó archivado.' },
};

function CourseEditor({ course }: { course: AdminCourseDetail | undefined }) {
  const navigate = useNavigate();
  const areas = useAdminAreas();
  const instructors = useAdminInstructors();
  const save = useSaveCourse();
  const status = useCourseStatus();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
    reset,
  } = useForm<CourseForm, unknown, CourseInput>({
    resolver: zodResolver(CourseFormSchema),
    defaultValues: toForm(course),
  });

  const onSubmit = handleSubmit((input) => {
    setMessage(null);
    save.mutate(
      { ...(course ? { id: course.id } : {}), input },
      {
        onSuccess: (saved) => {
          reset(toForm(saved));
          if (course) setMessage('Cambios guardados.');
          else void navigate(`/admin/cursos/${saved.id}`, { replace: true });
        },
      },
    );
  });

  const runStatus = (action: CourseStatusAction) => {
    if (!course) return;
    setMessage(null);
    status.mutate(
      { id: course.id, action },
      { onSuccess: () => setMessage(STATUS_ACTIONS[action].done) },
    );
  };

  const actions: CourseStatusAction[] = !course
    ? []
    : course.status === 'published'
      ? ['unpublish', 'archive']
      : course.status === 'draft'
        ? ['publish', 'archive']
        : ['unpublish'];

  return (
    <div>
      <p className="text-sm">
        <Link to="/admin/cursos" className="text-brand-700 underline">
          ← Volver a cursos
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-800">
          {course ? course.title : 'Nuevo curso'}
        </h1>
        {course && (
          <StatusBadge status={course.status} label={COURSE_STATUS_LABELS[course.status]} />
        )}
      </div>

      {course && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {actions.map((action) =>
            action === 'archive' ? (
              <ConfirmDialog
                key={action}
                trigger={
                  <button type="button" className={secondaryButton} disabled={status.isPending}>
                    Archivar
                  </button>
                }
                title="¿Archivar el curso?"
                description="El curso deja de mostrarse en el sitio y queda guardado con su historia. Podrás volver a publicarlo más adelante."
                confirmLabel="Archivar curso"
                onConfirm={() => runStatus('archive')}
              />
            ) : (
              <button
                key={action}
                type="button"
                className={action === 'publish' ? primaryButton : secondaryButton}
                disabled={status.isPending || isDirty}
                onClick={() => runStatus(action)}
              >
                {STATUS_ACTIONS[action].label}
              </button>
            ),
          )}
          {course.status === 'published' && (
            <Link to={`/cursos/${course.slug}`} className="text-sm text-brand-700 underline">
              Ver en el sitio
            </Link>
          )}
          {isDirty && (
            <span className="text-sm text-ink-muted">Guarda los cambios antes de publicar.</span>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        <Feedback error={status.error} success={message} />
      </div>

      <form
        noValidate
        aria-label="Datos del curso"
        onSubmit={(event) => void onSubmit(event)}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <Field label="Título" error={errors.title} className="sm:col-span-2">
          {(props) => <input {...props} className={inputClass} {...register('title')} />}
        </Field>
        <Field
          label="Identificador en la URL (slug)"
          hint="Minúsculas, números y guiones. Cambiarlo cambia la dirección de la ficha."
          error={errors.slug}
        >
          {(props) => <input {...props} className={inputClass} {...register('slug')} />}
        </Field>
        <Field label="Área" error={errors.areaId}>
          {(props) => (
            <select {...props} className={inputClass} {...register('areaId')}>
              <option value="">Selecciona un área</option>
              {areas.data?.items.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Modalidad" error={errors.modality}>
          {(props) => (
            <select {...props} className={inputClass} {...register('modality')}>
              {MODALITIES.map((modality) => (
                <option key={modality} value={modality}>
                  {MODALITY_LABELS[modality]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Duración (horas)" error={errors.durationHours}>
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              className={inputClass}
              {...register('durationHours', { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field
          label="Resumen"
          hint="Se muestra en las tarjetas del catálogo."
          error={errors.summary}
          className="sm:col-span-2"
        >
          {(props) => (
            <textarea {...props} rows={2} className={inputClass} {...register('summary')} />
          )}
        </Field>
        <Field
          label="Descripción"
          hint="Admite formato: ## para títulos, - para listas, **negrita**. No se admite HTML."
          error={errors.description}
          className="sm:col-span-2"
        >
          {(props) => (
            <textarea {...props} rows={6} className={inputClass} {...register('description')} />
          )}
        </Field>
        <Field label="Objetivos" hint="Uno por línea." error={errors.objectivesText}>
          {(props) => (
            <textarea {...props} rows={4} className={inputClass} {...register('objectivesText')} />
          )}
        </Field>
        <Field label="Contenidos" hint="Uno por línea." error={errors.contentsText}>
          {(props) => (
            <textarea {...props} rows={4} className={inputClass} {...register('contentsText')} />
          )}
        </Field>
        <Field label="Requisitos (opcional)" error={errors.requirements}>
          {(props) => (
            <textarea {...props} rows={2} className={inputClass} {...register('requirements')} />
          )}
        </Field>
        <Field label="Certificación (opcional)" error={errors.certificationInfo}>
          {(props) => (
            <textarea
              {...props}
              rows={2}
              className={inputClass}
              {...register('certificationInfo')}
            />
          )}
        </Field>
        <Field
          label="Imagen (opcional)"
          hint="Ruta interna (/img/…) o URL https"
          error={errors.imageUrl}
        >
          {(props) => <input {...props} className={inputClass} {...register('imageUrl')} />}
        </Field>
        <Field label="Texto alternativo de la imagen" error={errors.imageAlt}>
          {(props) => <input {...props} className={inputClass} {...register('imageAlt')} />}
        </Field>
        <Field label="Título SEO (opcional)" hint="Máximo 70 caracteres." error={errors.seoTitle}>
          {(props) => <input {...props} className={inputClass} {...register('seoTitle')} />}
        </Field>
        <Field
          label="Descripción SEO (opcional)"
          hint="Máximo 170 caracteres."
          error={errors.seoDescription}
        >
          {(props) => <input {...props} className={inputClass} {...register('seoDescription')} />}
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Docentes</legend>
          {instructors.data?.items.length === 0 && (
            <p className="text-sm text-ink-muted">
              Aún no hay docentes.{' '}
              <Link to="/admin/docentes" className="underline">
                Agrégalos aquí
              </Link>
              .
            </p>
          )}
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {instructors.data?.items.map((instructor) => (
              <label key={instructor.id} className="flex items-center gap-2">
                <input type="checkbox" value={instructor.id} {...register('instructorIds')} />
                {instructor.name}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" {...register('featured')} />
          Destacar en la portada
        </label>

        <CoursePreview
          title={watch('title')}
          summary={watch('summary')}
          description={watch('description')}
          objectivesText={watch('objectivesText')}
          contentsText={watch('contentsText')}
          requirements={String(watch('requirements') ?? '')}
        />

        <div className="sm:col-span-2">
          <Feedback error={save.error} />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className={primaryButton} disabled={save.isPending}>
            {course ? 'Guardar cambios' : 'Crear curso'}
          </button>
        </div>
      </form>

      {course && <EditionsSection course={course} />}
    </div>
  );
}
