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

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DISPLAY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Diferencia en ms entre la hora local de Punta Arenas y UTC en un instante dado. */
function displayZoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    offsetFormatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instante UTC en que comienza un día calendario (YYYY-MM-DD) en Punta Arenas.
 * Sirve para filtrar por fecha local contra columnas UTC.
 */
export function startOfLocalDay(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  const naiveUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Dos pasadas para respetar cambios de horario cerca de la medianoche.
  let instant = naiveUtc - displayZoneOffsetMs(new Date(naiveUtc));
  instant = naiveUtc - displayZoneOffsetMs(new Date(instant));
  return new Date(instant);
}

/** Día calendario siguiente (YYYY-MM-DD). */
export function nextIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
