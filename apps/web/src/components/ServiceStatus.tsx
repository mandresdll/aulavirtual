import { HealthResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** Indicador de disponibilidad de la API (solo Fase 0, para verificar la integración). */
export function ServiceStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch('/api/health', HealthResponseSchema),
    retry: false,
  });

  let text = 'Verificando el servicio…';
  let tone = 'bg-surface-muted text-ink-muted';
  if (isError) {
    text = 'El servicio no está disponible en este momento.';
    tone = 'bg-red-50 text-red-800';
  } else if (!isPending) {
    text = `Servicio en línea (versión ${data.version}).`;
    tone = 'bg-green-50 text-green-800';
  }

  return (
    <p role="status" className={`inline-block rounded px-3 py-1 text-sm ${tone}`}>
      {text}
    </p>
  );
}
