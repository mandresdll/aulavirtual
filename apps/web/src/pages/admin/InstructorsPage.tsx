import { zodResolver } from '@hookform/resolvers/zod';
import {
  InstructorInputSchema,
  type AdminInstructor,
  type InstructorInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
import { useAdminInstructors, useDeleteInstructor, useSaveInstructor } from '../../lib/admin';
import { useDocumentTitle } from '../../lib/use-document-title';

type InstructorForm = z.input<typeof InstructorInputSchema>;

/** Docentes que se muestran en las fichas de los cursos (RF-07). */
export function InstructorsPage() {
  useDocumentTitle('Docentes · Administración');
  const instructors = useAdminInstructors();
  const remove = useDeleteInstructor();
  const [editing, setEditing] = useState<AdminInstructor | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Docentes</h1>
        {editing === null && (
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            Nuevo docente
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <Feedback error={remove.error} success={message} />
        {editing !== null && (
          <InstructorEditor
            key={editing === 'new' ? 'new' : editing.id}
            instructor={editing === 'new' ? null : editing}
            onDone={(text) => {
              setEditing(null);
              setMessage(text);
            }}
          />
        )}

        {instructors.isPending && <LoadingMessage />}
        {instructors.isError && (
          <ErrorMessage error={instructors.error} onRetry={() => void instructors.refetch()} />
        )}
        {instructors.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Docentes</caption>
              <thead className="border-b border-gray-300">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Nombre
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Título o cargo
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Cursos
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {instructors.data.items.map((instructor) => (
                  <tr key={instructor.id} className="border-b border-gray-200">
                    <td className="py-2 pr-4 font-medium">{instructor.name}</td>
                    <td className="py-2 pr-4 text-ink-muted">{instructor.title ?? '—'}</td>
                    <td className="py-2 pr-4">{instructor.courseCount}</td>
                    <td className="flex flex-wrap gap-2 py-2">
                      <button
                        type="button"
                        className={smallButton}
                        aria-label={`Editar ${instructor.name}`}
                        onClick={() => {
                          setMessage(null);
                          setEditing(instructor);
                        }}
                      >
                        Editar
                      </button>
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            className={dangerButton}
                            aria-label={`Eliminar ${instructor.name}`}
                          >
                            Eliminar
                          </button>
                        }
                        title={`¿Eliminar a ${instructor.name}?`}
                        description="Solo se pueden eliminar docentes que no están asignados a cursos. Esta acción no se puede deshacer."
                        confirmLabel="Eliminar docente"
                        onConfirm={() =>
                          remove.mutate(instructor.id, {
                            onSuccess: () => setMessage(`Se eliminó a ${instructor.name}.`),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {instructors.data.items.length === 0 && (
              <p className="py-4 text-ink-muted">Aún no hay docentes.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InstructorEditor({
  instructor,
  onDone,
}: {
  instructor: AdminInstructor | null;
  onDone: (message: string | null) => void;
}) {
  const save = useSaveInstructor();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InstructorForm, unknown, InstructorInput>({
    resolver: zodResolver(InstructorInputSchema),
    defaultValues: {
      name: instructor?.name ?? '',
      title: instructor?.title ?? '',
      bio: instructor?.bio ?? '',
      photoUrl: instructor?.photoUrl ?? '',
    },
  });

  return (
    <form
      noValidate
      aria-label={instructor ? `Editar docente ${instructor.name}` : 'Nuevo docente'}
      onSubmit={handleSubmit((input) =>
        save.mutate(
          { ...(instructor ? { id: instructor.id } : {}), input },
          { onSuccess: (saved) => onDone(`Se guardó a ${saved.name}.`) },
        ),
      )}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold sm:col-span-2">
        {instructor ? 'Editar docente' : 'Nuevo docente'}
      </h2>
      <Field label="Nombre" error={errors.name}>
        {(props) => <input {...props} className={inputClass} {...register('name')} />}
      </Field>
      <Field label="Título o cargo (opcional)" error={errors.title}>
        {(props) => <input {...props} className={inputClass} {...register('title')} />}
      </Field>
      <Field label="Reseña (opcional)" error={errors.bio} className="sm:col-span-2">
        {(props) => <textarea {...props} rows={3} className={inputClass} {...register('bio')} />}
      </Field>
      <Field
        label="Foto (opcional)"
        hint="Ruta interna (/img/…) o URL https"
        error={errors.photoUrl}
        className="sm:col-span-2"
      >
        {(props) => <input {...props} className={inputClass} {...register('photoUrl')} />}
      </Field>
      <div className="sm:col-span-2">
        <Feedback error={save.error} />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Guardar docente
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone(null)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
