import { z } from 'zod';

/** Configuración del sitio editable desde el panel (RF-07). */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MIN_CONTRAST = 4.5;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(values: readonly number[]): string {
  return `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

/** Contraste WCAG entre un color y el texto blanco. */
export function contrastWithWhite(hex: string): number {
  const [red, green, blue] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
}

const mix = (hex: string, target: number, amount: number) =>
  toHex(channels(hex).map((value) => value + (target - value) * amount));

/** Tonos de la marca a partir de un color, como variables CSS de `styles.css`. */
export function brandRamp(hex: string): Record<string, string> {
  return {
    '--brand-50': mix(hex, 255, 0.94),
    '--brand-100': mix(hex, 255, 0.85),
    '--brand-600': hex,
    '--brand-700': hex,
    '--brand-800': mix(hex, 0, 0.22),
    '--brand-900': mix(hex, 0, 0.45),
  };
}

export const SiteSettingsSchema = z.object({
  heroTitle: z.string().trim().min(3, 'Escribe un título').max(120),
  heroText: z.string().trim().min(3, 'Escribe un texto').max(400),
  /** Aviso opcional en todas las páginas, p. ej. un cierre de inscripciones. */
  notice: z.string().trim().max(300),
  /** Color principal. Vacío: el burdeo provisorio de `styles.css`. */
  brandColor: z
    .string()
    .trim()
    .refine((value) => value === '' || HEX_COLOR.test(value), 'Usa el formato #7a1f3d')
    .refine(
      (value) => !HEX_COLOR.test(value) || contrastWithWhite(value) >= MIN_CONTRAST,
      'El color es muy claro: el texto blanco no se leería bien',
    ),
});
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  heroTitle: 'Cursos de la Unidad de Tecnologías para el Aprendizaje',
  heroText:
    'Capacitación del CFT Estatal de Magallanes abierta a la comunidad: cursos en línea, ' +
    'presenciales y mixtos, con certificación verificable.',
  notice: '',
  brandColor: '',
};
