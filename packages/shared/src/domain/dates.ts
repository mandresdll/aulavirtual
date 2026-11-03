/** Zona horaria en la que se muestran las fechas al usuario. En BD se guarda UTC. */
export const DISPLAY_TIME_ZONE = 'America/Punta_Arenas';

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'long',
});

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Fecha calendario (YYYY-MM-DD) en la zona horaria de Punta Arenas. */
export function toLocalIsoDate(date: Date): string {
  return isoDateFormatter.format(date);
}
