import { z } from 'zod';

/** Texto multilínea ⇄ lista (objetivos, contenidos): una línea por elemento. */
export const linesToList = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
export const listToLines = (items: readonly string[]) => items.join('\n');

/**
 * Valida el valor ya convertido del formulario con el esquema que usa la API y reporta los
 * errores en los mismos campos (paso final de `.transform` en los esquemas de formulario).
 */
export function validateWith<T extends z.ZodType>(schema: T) {
  return (value: unknown, ctx: z.RefinementCtx): z.output<T> => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
    return z.NEVER;
  };
}
