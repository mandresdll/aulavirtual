import { zodResolver } from '@hookform/resolvers/zod';
import {
  AdminLeadsQuerySchema,
  buildUtmLink,
  CAMPAIGN_STATUS_LABELS,
  CampaignInputSchema,
  formatDateTime,
  LEAD_STATUS_LABELS,
  type AdminCampaign,
  type CampaignInput,
} from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import {
  ConfirmDialog,
  Feedback,
  Field,
  inputClass,
  primaryButton,
  ScrollRegion,
  secondaryButton,
  smallButton,
} from '../../components/admin/ui';
import { Pagination } from '../../components/Pagination';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import {
  useAdminLeads,
  useCampaigns,
  useCreateCampaign,
  useSendCampaign,
} from '../../lib/diffusion';
import { useDocumentTitle } from '../../lib/use-document-title';

/** Enlaces con UTM, novedades e interesados (RF-02). */
export function DiffusionPage() {
  useDocumentTitle('Difusión · Administración');
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand-800">Difusión</h1>
      <LinkGenerator />
      <Campaigns />
      <Leads />
    </div>
  );
}

function LinkGenerator() {
  const [path, setPath] = useState('/cursos');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  const safePath = path.startsWith('/') ? path : `/${path}`;
  const link = source.trim()
    ? buildUtmLink(`${window.location.origin}${safePath}`, { source, medium, campaign })
    : null;

  return (
    <section aria-labelledby="enlaces">
      <h2 id="enlaces" className="text-lg font-semibold">
        Generador de enlaces
      </h2>
      <p className="text-sm text-ink-muted">
        Usa estos enlaces en tus campañas para medir de dónde llegan las visitas y las ventas.
      </p>
      <div className="mt-2 grid gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-2">
        {(
          [
            ['utm-path', 'Página del sitio', path, setPath, '/cursos/mi-curso'],
            ['utm-source', 'Fuente', source, setSource, 'facebook'],
            ['utm-medium', 'Medio', medium, setMedium, 'social'],
            ['utm-campaign', 'Campaña', campaign, setCampaign, 'matricula-2027'],
          ] as const
        ).map(([id, label, value, setValue, placeholder]) => (
          <div key={id}>
            <label htmlFor={id} className="block text-sm font-medium">
              {label}
            </label>
            <input
              id={id}
              value={value}
              placeholder={placeholder}
              className={inputClass}
              onChange={(event) => {
                setCopied(false);
                setValue(event.target.value);
              }}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          {link ? (
            <>
              <p className="break-all rounded bg-white p-2 text-sm">{link}</p>
              <button
                type="button"
                className={`${secondaryButton} mt-2`}
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true));
                }}
              >
                Copiar enlace
              </button>
              {copied && (
                <span role="status" className="ml-2 text-sm text-green-800">
                  Copiado
                </span>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-muted">Escribe al menos la fuente para ver el enlace.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Campaigns() {
  const campaigns = useCampaigns();
  const create = useCreateCampaign();
  const send = useSendCampaign();
  const [pending, setPending] = useState<AdminCampaign | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CampaignInput>({
    resolver: zodResolver(CampaignInputSchema),
    defaultValues: { subject: '', body: '' },
  });
  const audience = campaigns.data?.audience ?? 0;

  return (
    <section aria-labelledby="novedades">
      <h2 id="novedades" className="text-lg font-semibold">
        Novedades
      </h2>
      <p className="text-sm text-ink-muted">
        Se envían solo a quienes aceptaron recibirlas: hoy, {audience}{' '}
        {audience === 1 ? 'correo' : 'correos'}. Cada mensaje incluye su enlace de baja.
      </p>
      <form
        noValidate
        aria-labelledby="novedades"
        className="mt-2 grid gap-4 rounded-lg border border-gray-200 bg-surface-muted p-4"
        onSubmit={handleSubmit((input) => {
          setMessage(null);
          create.mutate(input, {
            onSuccess: () => {
              reset();
              setMessage('Borrador creado. Revísalo y envíalo desde la lista.');
            },
          });
        })}
      >
        <Field label="Asunto" error={errors.subject}>
          {(props) => <input {...props} className={inputClass} {...register('subject')} />}
        </Field>
        <Field label="Mensaje" error={errors.body}>
          {(props) => <textarea {...props} rows={6} className={inputClass} {...register('body')} />}
        </Field>
        <Feedback error={create.error ?? send.error} success={message} />
        <div>
          <button type="submit" className={primaryButton} disabled={create.isPending}>
            Crear borrador
          </button>
        </div>
      </form>

      {campaigns.isPending && <LoadingMessage />}
      {campaigns.isError && <ErrorMessage error={campaigns.error} />}
      {campaigns.data && campaigns.data.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {campaigns.data.items.map((campaign) => (
            <li
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-3 text-sm"
            >
              <div>
                <p className="font-semibold">{campaign.subject}</p>
                <p className="text-ink-muted">
                  {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  {campaign.status !== 'draft' &&
                    ` · ${campaign.sent} de ${campaign.recipients} enviados`}
                  {campaign.failed > 0 && ` · ${campaign.failed} sin enviar`}
                </p>
              </div>
              {campaign.status === 'draft' && (
                <button
                  type="button"
                  className={smallButton}
                  aria-label={`Enviar novedad ${campaign.subject}`}
                  onClick={() => setPending(campaign)}
                >
                  Enviar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={`¿Enviar «${pending.subject}»?`}
          description={`Se enviará a ${audience} ${audience === 1 ? 'correo' : 'correos'} y no se puede deshacer.`}
          confirmLabel="Enviar"
          onConfirm={() => {
            setMessage(null);
            send.mutate(pending.id, {
              onSuccess: () => setMessage('Novedad en envío.'),
              onSettled: () => setPending(null),
            });
          }}
        />
      )}
    </section>
  );
}

function Leads() {
  const [params, setParams] = useSearchParams();
  const parsed = AdminLeadsQuerySchema.safeParse(Object.fromEntries(params));
  const query = parsed.success ? parsed.data : AdminLeadsQuerySchema.parse({});
  const leads = useAdminLeads(query);

  return (
    <section aria-labelledby="interesados">
      <h2 id="interesados" className="text-lg font-semibold">
        Interesados
      </h2>
      <form
        role="search"
        aria-label="Buscar interesados"
        className="mt-2 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
          setParams(q ? { q } : {});
        }}
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="leads-q" className="block text-sm font-medium">
            Correo o nombre
          </label>
          <input id="leads-q" name="q" defaultValue={query.q ?? ''} className={inputClass} />
        </div>
        <button type="submit" className={secondaryButton}>
          Buscar
        </button>
      </form>

      {leads.isPending && <LoadingMessage />}
      {leads.isError && <ErrorMessage error={leads.error} />}
      {leads.data &&
        (leads.data.items.length === 0 ? (
          <p className="mt-3 text-ink-muted">No hay interesados.</p>
        ) : (
          <>
            <ScrollRegion label="Tabla de interesados" className="mt-3">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Interesados con su consentimiento</caption>
                <thead>
                  <tr className="border-b border-gray-300">
                    <th scope="col" className="py-2 pr-3">
                      Correo
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Curso
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Estado
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Consentimiento
                    </th>
                    <th scope="col" className="py-2">
                      Campaña
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leads.data.items.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-200">
                      <td className="py-2 pr-3">{lead.email}</td>
                      <td className="py-2 pr-3">{lead.courseTitle ?? '—'}</td>
                      <td className="py-2 pr-3">{LEAD_STATUS_LABELS[lead.status]}</td>
                      <td className="py-2 pr-3">
                        {formatDateTime(new Date(lead.consentedAt))} · v{lead.consentVersion}
                      </td>
                      <td className="py-2">{lead.utmCampaign ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <Pagination
              page={leads.data.page}
              totalPages={leads.data.totalPages}
              hrefFor={(page) => {
                const next = new URLSearchParams(params);
                next.set('page', String(page));
                return `?${next.toString()}`;
              }}
            />
          </>
        ))}
    </section>
  );
}
