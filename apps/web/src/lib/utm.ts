import { parseUtm, UtmSchema, type Utm } from '@plataforma/shared';

/**
 * UTM de la visita (RF-02). Se guardan solo mientras dure la pestaña: acompañan al visitante hasta
 * el formulario de interés o la compra, también tras ingresar o pasar por la pasarela.
 */
const STORAGE_KEY = 'plataforma.utm';

export function captureUtm(search: string): void {
  const utm = parseUtm(search);
  if (!utm) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // Sin almacenamiento la visita simplemente queda sin campaña.
  }
}

export function readUtm(): Utm | undefined {
  try {
    const parsed = UtmSchema.safeParse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null'));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
