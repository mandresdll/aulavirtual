import { z } from 'zod';

/**
 * Montos en pesos chilenos (CLP). Siempre enteros: el CLP no usa decimales.
 */
export const ClpAmountSchema = z
  .number()
  .int('El monto debe ser un número entero de pesos')
  .nonnegative('El monto no puede ser negativo')
  .max(Number.MAX_SAFE_INTEGER);

export type ClpAmount = z.infer<typeof ClpAmountSchema>;

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatClp(amount: ClpAmount): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Invalid CLP amount: ${amount}`);
  }
  return clpFormatter.format(amount);
}

/**
 * Aplica un porcentaje sobre un monto en CLP redondeando hacia abajo,
 * de modo que un descuento nunca supere el porcentaje declarado.
 */
export function percentageOf(amount: ClpAmount, percent: number): ClpAmount {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Invalid CLP amount: ${amount}`);
  }
  if (percent < 0 || percent > 100) {
    throw new RangeError(`Invalid percentage: ${percent}`);
  }
  return Math.floor((amount * percent) / 100);
}
