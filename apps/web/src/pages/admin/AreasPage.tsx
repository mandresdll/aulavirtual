import { zodResolver } from '@hookform/resolvers/zod';
import { AreaInputSchema, type AdminArea, type AreaInput } from '@plataforma/shared';
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
  ScrollRegion,
  secondaryButton,
  smallButton,
} from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminAreas, useDeleteArea, useSaveArea } from '../../lib/admin';
import { useDocumentTitle } from '../../lib/use-document-title';

type AreaForm = z.input<typeof AreaInputSchema>;
const EMPTY: AreaForm = { slug: '', name: '', description: '' };

/** Áreas temáticas (RF-07). */
export function AreasPage() {
  useDocumentTitle('Áreas · Administración');
  const areas = useAdminAreas();
  const remove = useDeleteArea();
  const [editing, setEditing] = useState<AdminArea | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Áreas</h1>
        {editing === null && (
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            Nueva área
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <Feedback error={remove.error} success={message} />
        {editing !== null && (
          <AreaEditor
            key={editing === 'new' ? 'new' : editing.id}
            area={editing === 'new' ? null : editing}
            onDone={(text) => {
              setEditing(null);
              setMessage(text);
            }}
          />
        )}

        {areas.isPending && <LoadingMessage />}
        {areas.isError && <ErrorMessage error={areas.error} onRetry={() => void areas.refetch()} />}
        {areas.data && (
          <ScrollRegion label="Tabla de áreas">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Áreas del catálogo</caption>
              <thead className="border-b border-gray-300">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Nombre
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Slug
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
                {areas.data.items.map((area) => (
                  <tr key={area.id} className="border-b border-gray-200">
                    <td className="py-2 pr-4 font-medium">{area.name}</td>
                    <td className="py-2 pr-4 text-ink-muted">{area.slug}</td>
                    <td className="py-2 pr-4">{area.courseCount}</td>
                    <td className="flex flex-wrap gap-2 py-2">
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() => {
                          setMessage(null);
                          setEditing(area);
                        }}
                        aria-label={`Editar ${area.name}`}
                      >
                        Editar
                      </button>
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            className={dangerButton}
                            aria-label={`Eliminar ${area.name}`}
                          >
                            Eliminar
                          </button>
                        }
                        title={`¿Eliminar el área «${area.name}»?`}
                        description="Solo se pueden eliminar áreas sin cursos. Esta acción no se puede deshacer."
                        confirmLabel="Eliminar área"
                        onConfirm={() =>
                          remove.mutate(area.id, {
                            onSuccess: () => setMessage(`Se eliminó el área «${area.name}».`),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {areas.data.items.length === 0 && (
              <p className="py-4 text-ink-muted">Aún no hay áreas.</p>
            )}
          </ScrollRegion>
        )}
      </div>
    </div>
  );
}

function AreaEditor({
  area,
  onDone,
}: {
  area: AdminArea | null;
  onDone: (message: string | null) => void;
}) {
  const save = useSaveArea();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AreaForm, unknown, AreaInput>({
    resolver: zodResolver(AreaInputSchema),
    defaultValues: area
      ? { slug: area.slug, name: area.name, description: area.description ?? '' }
      : EMPTY,
  });

  return (
    <form
      noValidate
      aria-label={area ? `Editar área ${area.name}` : 'Nueva área'}
      onSubmit={handleSubmit((input) =>
        save.mutate(
          { ...(area ? { id: area.id } : {}), input },
          { onSuccess: (saved) => onDone(`Se guardó el área «${saved.name}».`) },
        ),
      )}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold sm:col-span-2">{area ? 'Editar área' : 'Nueva área'}</h2>
      <Field label="Nombre" error={errors.name}>
        {(props) => <input {...props} className={inputClass} {...register('name')} />}
      </Field>
      <Field
        label="Identificador en la URL (slug)"
        hint="Minúsculas, números y guiones. Ej.: tecnologia"
        error={errors.slug}
      >
        {(props) => <input {...props} className={inputClass} {...register('slug')} />}
      </Field>
      <Field label="Descripción (opcional)" error={errors.description} className="sm:col-span-2">
        {(props) => (
          <textarea {...props} rows={3} className={inputClass} {...register('description')} />
        )}
      </Field>
      <div className="sm:col-span-2">
        <Feedback error={save.error} />
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Guardar área
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone(null)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
