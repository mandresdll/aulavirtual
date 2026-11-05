import { zodResolver } from '@hookform/resolvers/zod';
import { LEAD_CONSENT, LeadRequestSchema, type LeadRequest } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useSubscribeLead } from '../lib/diffusion';
import { readUtm } from '../lib/utm';
import { Feedback, Field, inputClass, primaryButton } from './admin/ui';

/** Formulario de interés de la ficha (RF-02). La casilla parte sin marcar (Ley 21.719). */
export function LeadForm({ courseSlug }: { courseSlug: string }) {
  const subscribe = useSubscribeLead();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof LeadRequestSchema>, unknown, LeadRequest>({
    resolver: zodResolver(LeadRequestSchema),
    defaultValues: { email: '', name: '', courseSlug, consentVersion: LEAD_CONSENT.version },
  });

  return (
    <section aria-labelledby="interes" className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 id="interes" className="text-xl font-bold text-ink">
        ¿Te interesa este curso?
      </h2>
      {subscribe.isSuccess ? (
        <p role="status" className="mt-2 text-green-800">
          Listo. Te avisaremos las novedades de los cursos UTA a tu correo.
        </p>
      ) : (
        <form
          noValidate
          aria-labelledby="interes"
          className="mt-3 grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit((input) => {
            const utm = readUtm();
            subscribe.mutate({ ...input, ...(utm ? { utm } : {}) });
          })}
        >
          <Field label="Correo" error={errors.email}>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                className={inputClass}
                {...register('email')}
              />
            )}
          </Field>
          <Field label="Nombre (opcional)" error={errors.name}>
            {(props) => (
              <input {...props} autoComplete="name" className={inputClass} {...register('name')} />
            )}
          </Field>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? 'interes-consent-error' : undefined}
                {...register('consent')}
              />
              <span>{LEAD_CONSENT.text}</span>
            </label>
            {errors.consent && (
              <p id="interes-consent-error" className="mt-1 text-sm text-red-800">
                {errors.consent.message}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Feedback error={subscribe.error} />
            <button type="submit" className={primaryButton} disabled={subscribe.isPending}>
              Quiero recibir novedades
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
