import { MODALITIES, MODALITY_LABELS, type Area } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import type { CatalogFilters } from '../lib/catalog';

interface CourseFiltersProps {
  defaultValues: CatalogFilters;
  areas: Area[];
  onSubmit: (filters: CatalogFilters) => void;
  onClear: () => void;
}

const fieldClass =
  'mt-1 block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-base text-ink placeholder:text-ink-muted focus:border-brand-700';
const labelClass = 'block text-sm font-medium text-ink';

/** Buscador y filtros del catálogo (búsqueda, área, modalidad y rango de fechas de inicio). */
export function CourseFilters({ defaultValues, areas, onSubmit, onClear }: CourseFiltersProps) {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CatalogFilters>({ defaultValues });

  const toError = errors.to?.message;

  return (
    <form
      role="search"
      aria-label="Buscar cursos"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="sm:col-span-2 lg:col-span-6">
        <label htmlFor="filtro-q" className={labelClass}>
          Buscar por nombre o tema
        </label>
        <input
          id="filtro-q"
          type="search"
          maxLength={100}
          placeholder="Ej.: programación, Excel, emprendimiento"
          className={fieldClass}
          {...register('q')}
        />
      </div>

      <div className="lg:col-span-2">
        <label htmlFor="filtro-area" className={labelClass}>
          Área
        </label>
        <select id="filtro-area" className={fieldClass} {...register('area')}>
          <option value="">Todas las áreas</option>
          {areas.map((area) => (
            <option key={area.slug} value={area.slug}>
              {area.name} ({area.courseCount})
            </option>
          ))}
        </select>
      </div>

      <div className="lg:col-span-2">
        <label htmlFor="filtro-modalidad" className={labelClass}>
          Modalidad
        </label>
        <select id="filtro-modalidad" className={fieldClass} {...register('modality')}>
          <option value="">Todas las modalidades</option>
          {MODALITIES.map((modality) => (
            <option key={modality} value={modality}>
              {MODALITY_LABELS[modality]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
        <legend className={`${labelClass} col-span-2`}>Fecha de inicio</legend>
        <div>
          <label htmlFor="filtro-desde" className="block text-sm text-ink-muted">
            Desde
          </label>
          <input id="filtro-desde" type="date" className={fieldClass} {...register('from')} />
        </div>
        <div>
          <label htmlFor="filtro-hasta" className="block text-sm text-ink-muted">
            Hasta
          </label>
          <input
            id="filtro-hasta"
            type="date"
            className={fieldClass}
            aria-invalid={toError ? true : undefined}
            aria-describedby={toError ? 'filtro-hasta-error' : undefined}
            {...register('to', {
              validate: (to) => {
                const from = getValues('from');
                return !to || !from || from <= to || 'Debe ser igual o posterior a "Desde".';
              },
            })}
          />
        </div>
        {toError && (
          <p id="filtro-hasta-error" role="alert" className="col-span-2 text-sm text-red-800">
            {toError}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-6">
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-5 py-2 font-semibold text-white hover:bg-brand-800"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-brand-700 px-5 py-2 font-semibold text-brand-700 hover:bg-brand-50"
        >
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}
