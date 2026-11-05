import { zodResolver } from '@hookform/resolvers/zod';
import {
  CouponCodeSchema,
  formatClp,
  InvoiceDataSchema,
  LEGAL_DOCUMENT_SLUGS,
  SALES_DOCUMENT_LABELS,
  SALES_DOCUMENT_TYPES,
  TAX_TREATMENT_LABELS,
  type InvoiceData,
  type Quote,
  type SalesDocumentType,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import {
  Feedback,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useCreateOrder, useProviderInfo, useQuote } from '../lib/commerce';
import { useSession } from '../lib/session';
import { useDocumentTitle } from '../lib/use-document-title';

const CheckoutFormSchema = z
  .object({
    documentType: z.enum(SALES_DOCUMENT_TYPES),
    invoice: z.object({
      rut: z.string(),
      businessName: z.string(),
      activity: z.string(),
      address: z.string(),
    }),
    accepted: z.record(z.string(), z.boolean()),
  })
  .superRefine((form, ctx) => {
    if (form.documentType !== 'invoice') return;
    const parsed = InvoiceDataSchema.safeParse(form.invoice);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['invoice', ...issue.path] });
      }
    }
  });
type CheckoutForm = z.infer<typeof CheckoutFormSchema>;

/**
 * Checkout (RF-03, RF-04, RF-11): resumen con el total final, cupón, boleta o factura y
 * aceptación explícita (casillas sin marcar) de los textos legales vigentes. La orden se crea
 * con una clave de idempotencia por visita: un doble envío no duplica la compra.
 */
export function CheckoutPage() {
  useDocumentTitle('Confirmar compra');
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LoadingMessage />;
  if (!session.data?.authenticated) {
    return (
      <Navigate
        to={`/ingresar?${new URLSearchParams({ returnTo: location.pathname }).toString()}`}
        replace
      />
    );
  }
  return <Checkout />;
}

function Checkout() {
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponFormatError, setCouponFormatError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const quote = useQuote(couponCode);
  const createOrder = useCreateOrder(idempotencyKey);

  const applyCoupon = () => {
    if (couponInput.trim() === '') {
      setCouponFormatError(null);
      setCouponCode(null);
      return;
    }
    const parsed = CouponCodeSchema.safeParse(couponInput);
    if (!parsed.success) {
      setCouponFormatError(parsed.error.issues[0]?.message ?? 'Código inválido');
      return;
    }
    setCouponFormatError(null);
    setCouponCode(parsed.data);
  };

  if (quote.isPending) return <LoadingMessage />;
  if (quote.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold text-brand-800">Confirmar compra</h1>
        <div className="mt-4">
          <ErrorMessage error={quote.error} onRetry={() => void quote.refetch()} />
        </div>
      </div>
    );
  }
  const data = quote.data;

  if (data.lines.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold text-brand-800">Confirmar compra</h1>
        <p className="mt-4 text-ink-muted">No hay cursos disponibles en tu carrito.</p>
        <Link to="/carrito" className="mt-4 inline-block font-semibold text-brand-700 underline">
          Volver al carrito
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[3fr_2fr]">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">Confirmar compra</h1>
        <CheckoutDetails
          quote={data}
          pending={createOrder.isPending}
          error={createOrder.error}
          onSubmit={(form) =>
            createOrder.mutate(
              {
                couponCode: data.coupon?.code ?? null,
                documentType: form.documentType,
                invoice: form.documentType === 'invoice' ? (form.invoice as InvoiceData) : null,
                acceptedLegal: data.legal.map(({ type, version }) => ({ type, version })),
              },
              { onSuccess: (order) => void navigate(`/ordenes/${order.number}`) },
            )
          }
        />
      </div>

      <aside
        aria-labelledby="resumen-titulo"
        className="h-fit rounded-lg border border-gray-200 p-4"
      >
        <h2 id="resumen-titulo" className="text-lg font-bold">
          Resumen
        </h2>
        <ul className="mt-3 space-y-3 text-sm">
          {data.lines.map((line) => (
            <li key={line.editionId}>
              <p className="font-medium">{line.courseTitle}</p>
              <p className="text-ink-muted">
                Edición {line.editionCode} · {TAX_TREATMENT_LABELS[line.taxTreatment]}
              </p>
              <p>
                {formatClp(line.unitPriceClp)}
                {line.discountClp > 0 && (
                  <span className="text-green-800"> − {formatClp(line.discountClp)}</span>
                )}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <label htmlFor="cupon" className="block text-sm font-medium">
            Cupón de descuento
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="cupon"
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value)}
              aria-invalid={couponFormatError || data.couponError ? true : undefined}
              aria-describedby="cupon-estado"
              className={inputClass}
            />
            <button type="button" onClick={applyCoupon} className={`${secondaryButton} mt-1`}>
              Aplicar
            </button>
          </div>
          <p id="cupon-estado" role="status" className="mt-1 text-sm">
            {couponFormatError ? (
              <span className="text-red-800">{couponFormatError}</span>
            ) : data.couponError ? (
              <span className="text-red-800">{data.couponError}</span>
            ) : data.coupon ? (
              <span className="text-green-800">
                Cupón {data.coupon.code} aplicado: {data.coupon.description}.
              </span>
            ) : null}
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-gray-200 pt-4">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatClp(data.subtotalClp)}</dd>
          {data.discountClp > 0 && (
            <>
              <dt>Descuento</dt>
              <dd className="text-right text-green-800">− {formatClp(data.discountClp)}</dd>
            </>
          )}
          <dt className="text-lg font-bold">Total a pagar</dt>
          <dd className="text-right text-lg font-bold">{formatClp(data.totalClp)}</dd>
        </dl>
        <p className="mt-1 text-xs text-ink-muted">Precio final con impuestos incluidos.</p>
        <ProviderSummary />
      </aside>
    </div>
  );
}

function CheckoutDetails({
  quote,
  pending,
  error,
  onSubmit,
}: {
  quote: Quote;
  pending: boolean;
  error: unknown;
  onSubmit: (form: CheckoutForm) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: zodResolver(CheckoutFormSchema),
    defaultValues: {
      documentType: 'receipt',
      invoice: { rut: '', businessName: '', activity: '', address: '' },
      accepted: {},
    },
  });
  const documentType = watch('documentType') as SalesDocumentType;

  return (
    <form
      noValidate
      aria-label="Datos de la compra"
      className="mt-6 space-y-6"
      onSubmit={handleSubmit((form) => {
        const missing = quote.legal.filter((doc) => !form.accepted[doc.type]);
        if (missing.length > 0) {
          for (const doc of missing) {
            setError(`accepted.${doc.type}`, { message: 'Debes aceptar este documento' });
          }
          return;
        }
        onSubmit(form);
      })}
    >
      <fieldset>
        <legend className="text-lg font-semibold">Documento tributario</legend>
        <div className="mt-2 flex flex-wrap gap-6">
          {SALES_DOCUMENT_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input type="radio" value={type} {...register('documentType')} />
              {SALES_DOCUMENT_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      {documentType === 'invoice' && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="text-lg font-semibold">Datos para la factura</legend>
          <Field label="RUT de la empresa" hint="Ej.: 76.086.428-5" error={errors.invoice?.rut}>
            {(props) => <input {...props} className={inputClass} {...register('invoice.rut')} />}
          </Field>
          <Field label="Razón social" error={errors.invoice?.businessName}>
            {(props) => (
              <input {...props} className={inputClass} {...register('invoice.businessName')} />
            )}
          </Field>
          <Field label="Giro" error={errors.invoice?.activity}>
            {(props) => (
              <input {...props} className={inputClass} {...register('invoice.activity')} />
            )}
          </Field>
          <Field label="Dirección" error={errors.invoice?.address}>
            {(props) => (
              <input {...props} className={inputClass} {...register('invoice.address')} />
            )}
          </Field>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-lg font-semibold">Aceptación de condiciones</legend>
        <p className="mt-1 text-sm text-ink-muted">
          Para continuar debes leer y aceptar cada documento. Se registra la versión aceptada.
        </p>
        <ul className="mt-3 space-y-2">
          {quote.legal.map((doc) => {
            const fieldError = errors.accepted?.[doc.type];
            const errorId = `acepta-${doc.type}-error`;
            return (
              <li key={doc.type}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? errorId : undefined}
                    {...register(`accepted.${doc.type}`)}
                  />
                  <span>
                    He leído y acepto:{' '}
                    <Link
                      to={`/legal/${LEGAL_DOCUMENT_SLUGS[doc.type]}`}
                      target="_blank"
                      rel="noopener"
                      className="text-brand-700 underline"
                    >
                      {doc.title}
                      <span className="sr-only"> (se abre en una pestaña nueva)</span>
                    </Link>{' '}
                    <span className="text-xs text-ink-muted">(versión {doc.version})</span>
                  </span>
                </label>
                {fieldError?.message && (
                  <p id={errorId} className="ml-6 text-sm text-red-800">
                    {fieldError.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <Feedback error={error} />

      <button type="submit" className={primaryButton} disabled={pending}>
        {quote.totalClp === 0 ? 'Confirmar inscripción' : 'Confirmar compra'}
      </button>
      {quote.totalClp > 0 && (
        <p className="text-sm text-ink-muted">
          Al confirmar se reservan tus cupos por un tiempo limitado mientras completas el pago.
        </p>
      )}
    </form>
  );
}

function ProviderSummary() {
  const provider = useProviderInfo();
  if (!provider.data) return null;
  return (
    <p className="mt-4 border-t border-gray-200 pt-4 text-xs text-ink-muted">
      Vende: {provider.data.name}. RUT {provider.data.rut}. {provider.data.address}.{' '}
      {provider.data.email}.
    </p>
  );
}
