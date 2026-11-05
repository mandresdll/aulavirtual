import { zodResolver } from '@hookform/resolvers/zod';
import { SiteSettingsSchema, type SiteSettings } from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Feedback, Field, inputClass, primaryButton } from '../../components/admin/ui';
import { useSaveSettings, useSiteSettings } from '../../lib/settings';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Textos de la portada, aviso general y color principal del sitio (RF-07). */
export function SettingsPage() {
  useDocumentTitle('Configuración · Administración');
  const settings = useSiteSettings();
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Configuración</h1>
      <p className="mt-1 text-ink-muted">Los cambios se ven en el sitio apenas se guardan.</p>
      <SettingsForm key={JSON.stringify(settings)} settings={settings} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: SiteSettings }) {
  const save = useSaveSettings();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SiteSettings>({
    resolver: zodResolver(SiteSettingsSchema),
    defaultValues: settings,
  });

  return (
    <form
      noValidate
      aria-label="Configuración del sitio"
      className="mt-4 grid gap-4"
      onSubmit={handleSubmit((input) => {
        setMessage(null);
        save.mutate(input, { onSuccess: () => setMessage('Configuración guardada.') });
      })}
    >
      <Field label="Título de la portada" error={errors.heroTitle}>
        {(props) => <input {...props} className={inputClass} {...register('heroTitle')} />}
      </Field>
      <Field label="Texto de la portada" error={errors.heroText}>
        {(props) => (
          <textarea {...props} rows={3} className={inputClass} {...register('heroText')} />
        )}
      </Field>
      <Field
        label="Aviso general (opcional)"
        hint="Se muestra arriba en todas las páginas. Déjalo vacío para no mostrarlo."
        error={errors.notice}
      >
        {(props) => <input {...props} className={inputClass} {...register('notice')} />}
      </Field>
      <Field
        label="Color principal (opcional)"
        hint="En formato #7a1f3d. Debe ser oscuro, para que el texto blanco se lea bien."
        error={errors.brandColor}
      >
        {(props) => <input {...props} className={inputClass} {...register('brandColor')} />}
      </Field>
      <Feedback error={save.error} success={message} />
      <div>
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Guardar
        </button>
      </div>
    </form>
  );
}
