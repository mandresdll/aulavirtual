import { zodResolver } from '@hookform/resolvers/zod';
import {
  COUPON_REASON_LABELS,
  COUPON_REASONS,
  COUPON_SCOPE_LABELS,
  COUPON_SCOPES,
  COUPON_TYPE_LABELS,
  COUPON_TYPES,
  CouponInputSchema,
  formatClp,
  formatDate,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  type AdminCoupon,
  type CouponInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  smallButton,
  StatusBadge,
} from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { useAdminCourse, useAdminCourses, useAdminCoupons, useSaveCoupon } from '../../lib/admin';
import { validateWith } from '../../lib/forms';
import { useDocumentTitle } from '../../lib/use-document-title';

const localOrEmpty = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]);

/** Fechas en hora de Punta Arenas (`datetime-local`), enviadas en UTC. */
const CouponFormSchema = z
  .object({
    code: z.string(),
    type: z.enum(COUPON_TYPES),
    value: z.number(),
    scope: z.enum(COUPON_SCOPES),
    courseId: z.string(),
    editionId: z.string(),
    validFrom: localOrEmpty,
    validUntil: localOrEmpty,
    maxUses: z.unknown(),
    maxUsesPerUser: z.unknown(),
    reason: z.enum(COUPON_REASONS),
    active: z.boolean(),
  })
  .transform((form) => ({
    ...form,
    validFrom: form.validFrom ? fromLocalDateTimeInput(form.validFrom).toISOString() : null,
    validUntil: form.validUntil ? fromLocalDateTimeInput(form.validUntil).toISOString() : null,
  }))
  .transform(validateWith(CouponInputSchema));
type CouponForm = z.input<typeof CouponFormSchema>;

const local = (iso: string | null) => (iso ? toLocalDateTimeInput(new Date(iso)) : '');

function toForm(coupon: AdminCoupon | null): CouponForm {
  return {
    code: coupon?.code ?? '',
    type: coupon?.type ?? 'percentage',
    value: coupon?.value ?? 10,
    scope: coupon?.scope ?? 'all',
    courseId: coupon?.courseId ?? '',
    editionId: coupon?.editionId ?? '',
    validFrom: local(coupon?.validFrom ?? null),
    validUntil: local(coupon?.validUntil ?? null),
    maxUses: coupon?.maxUses ?? '',
    maxUsesPerUser: coupon?.maxUsesPerUser ?? 1,
    reason: coupon?.reason ?? 'promotion',
    active: coupon?.active ?? true,
  };
}

const describeValue = (coupon: AdminCoupon) =>
  coupon.type === 'percentage' ? `${coupon.value} %` : formatClp(coupon.value);

/** Cupones de descuento, becas y convenios (RF-04). No se eliminan: se desactivan. */
export function CouponsPage() {
  useDocumentTitle('Cupones · Administración');
  const coupons = useAdminCoupons();
  const [editing, setEditing] = useState<AdminCoupon | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Cupones</h1>
        {editing === null && (
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            Nuevo cupón
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <Feedback success={message} />
        {editing !== null && (
          <CouponEditor
            key={editing === 'new' ? 'new' : editing.id}
            coupon={editing === 'new' ? null : editing}
            onDone={(text) => {
              setEditing(null);
              setMessage(text);
            }}
          />
        )}

        {coupons.isPending && <LoadingMessage />}
        {coupons.isError && (
          <ErrorMessage error={coupons.error} onRetry={() => void coupons.refetch()} />
        )}
        {coupons.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Cupones</caption>
              <thead className="border-b border-gray-300">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Código
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Descuento
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Alcance
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Vigencia
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Usos
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
                {coupons.data.items.map((coupon) => (
                  <tr key={coupon.id} className="border-b border-gray-200 align-top">
                    <td className="py-2 pr-4 font-medium">
                      {coupon.code}
                      <span className="block text-xs text-ink-muted">
                        {COUPON_REASON_LABELS[coupon.reason]}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{describeValue(coupon)}</td>
                    <td className="py-2 pr-4">{coupon.scopeLabel ?? COUPON_SCOPE_LABELS.all}</td>
                    <td className="py-2 pr-4">
                      {coupon.validFrom ? formatDate(new Date(coupon.validFrom)) : 'Sin inicio'} –{' '}
                      {coupon.validUntil ? formatDate(new Date(coupon.validUntil)) : 'sin término'}
                    </td>
                    <td className="py-2 pr-4">
                      {coupon.usesCount}
                      {coupon.maxUses !== null && ` / ${coupon.maxUses}`}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        status={coupon.active ? 'published' : 'archived'}
                        label={coupon.active ? 'Activo' : 'Inactivo'}
                      />
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className={smallButton}
                        aria-label={`Editar cupón ${coupon.code}`}
                        onClick={() => {
                          setMessage(null);
                          setEditing(coupon);
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coupons.data.items.length === 0 && (
              <p className="py-4 text-ink-muted">Aún no hay cupones.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CouponEditor({
  coupon,
  onDone,
}: {
  coupon: AdminCoupon | null;
  onDone: (message: string | null) => void;
}) {
  const save = useSaveCoupon();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CouponForm, unknown, CouponInput>({
    resolver: zodResolver(CouponFormSchema),
    defaultValues: toForm(coupon),
  });
  const scope = watch('scope');
  const type = watch('type');
  const courseId = watch('courseId');
  const courses = useAdminCourses({ page: 1, pageSize: 100 });
  const course = useAdminCourse(scope === 'edition' && courseId ? courseId : undefined);

  return (
    <form
      noValidate
      aria-label={coupon ? `Editar cupón ${coupon.code}` : 'Nuevo cupón'}
      onSubmit={handleSubmit((input) =>
        save.mutate(
          { ...(coupon ? { id: coupon.id } : {}), input },
          { onSuccess: (saved) => onDone(`Se guardó el cupón ${saved.code}.`) },
        ),
      )}
      className="grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <h2 className="text-lg font-semibold sm:col-span-2 lg:col-span-3">
        {coupon ? `Editar cupón ${coupon.code}` : 'Nuevo cupón'}
      </h2>
      <Field label="Código" hint="Ej.: BECA-2026" error={errors.code}>
        {(props) => <input {...props} className={inputClass} {...register('code')} />}
      </Field>
      <Field label="Tipo de descuento" error={errors.type}>
        {(props) => (
          <select {...props} className={inputClass} {...register('type')}>
            {COUPON_TYPES.map((value) => (
              <option key={value} value={value}>
                {COUPON_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        label={type === 'percentage' ? 'Porcentaje' : 'Monto (CLP)'}
        hint={type === 'percentage' ? '100 = inscripción sin costo' : 'Pesos, sin puntos'}
        error={errors.value}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            min={1}
            className={inputClass}
            {...register('value', { valueAsNumber: true })}
          />
        )}
      </Field>
      <Field label="Alcance" error={errors.scope}>
        {(props) => (
          <select {...props} className={inputClass} {...register('scope')}>
            {COUPON_SCOPES.map((value) => (
              <option key={value} value={value}>
                {COUPON_SCOPE_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {scope !== 'all' && (
        <Field label="Curso" error={errors.courseId}>
          {(props) => (
            <select {...props} className={inputClass} {...register('courseId')}>
              <option value="">Selecciona un curso</option>
              {courses.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {scope === 'edition' && (
        <Field label="Edición" error={errors.editionId}>
          {(props) => (
            <select {...props} className={inputClass} {...register('editionId')}>
              <option value="">Selecciona una edición</option>
              {course.data?.editions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.code}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field label="Vigente desde (opcional)" error={errors.validFrom}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('validFrom')}
          />
        )}
      </Field>
      <Field label="Vigente hasta (opcional)" error={errors.validUntil}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            {...register('validUntil')}
          />
        )}
      </Field>
      <Field label="Usos máximos (opcional)" hint="Vacío = sin límite" error={errors.maxUses}>
        {(props) => (
          <input
            {...props}
            type="number"
            min={1}
            className={inputClass}
            {...register('maxUses', { setValueAs: toOptionalNumber })}
          />
        )}
      </Field>
      <Field
        label="Usos por persona (opcional)"
        hint="Vacío = sin límite"
        error={errors.maxUsesPerUser}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            min={1}
            className={inputClass}
            {...register('maxUsesPerUser', { setValueAs: toOptionalNumber })}
          />
        )}
      </Field>
      <Field label="Motivo" error={errors.reason}>
        {(props) => (
          <select {...props} className={inputClass} {...register('reason')}>
            {COUPON_REASONS.map((value) => (
              <option key={value} value={value}>
                {COUPON_REASON_LABELS[value]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
        <input type="checkbox" {...register('active')} />
        Cupón activo
      </label>
      <div className="sm:col-span-2 lg:col-span-3">
        <Feedback error={save.error} />
      </div>
      <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Guardar cupón
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone(null)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function toOptionalNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}
