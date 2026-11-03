import { z } from 'zod';

/** Quita puntos, guion y espacios, y deja la K en mayúscula. */
export function cleanRut(value: string): string {
  return value.replace(/[.\-\s]/g, '').toUpperCase();
}

/** Calcula el dígito verificador (módulo 11) del cuerpo de un RUT. */
export function computeRutCheckDigit(body: string): string {
  if (!/^\d+$/.test(body)) {
    throw new TypeError('RUT body must contain digits only');
  }
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

export function isValidRut(value: string): boolean {
  const match = /^(\d{1,8})([\dK])$/.exec(cleanRut(value));
  if (!match?.[1] || !match[2]) return false;
  return computeRutCheckDigit(match[1]) === match[2];
}

/** Normaliza al formato canónico de almacenamiento: `12345678-5`. */
export function normalizeRut(value: string): string {
  const clean = cleanRut(value);
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** Formato de presentación: `12.345.678-5`. */
export function formatRut(value: string): string {
  const clean = cleanRut(value);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}

export const RutSchema = z
  .string()
  .trim()
  .refine(isValidRut, { message: 'RUT inválido' })
  .transform(normalizeRut);
