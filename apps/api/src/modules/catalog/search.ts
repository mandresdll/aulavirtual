const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 40;

/**
 * Convierte el texto del buscador en una expresión `to_tsquery` segura: solo letras y números,
 * cada término como prefijo (`progra:*` encuentra "programación") y todos obligatorios (`&`).
 * Las tildes se quitan en PostgreSQL con `immutable_unaccent`, igual que en los documentos.
 * Devuelve `undefined` si no queda ningún término útil.
 */
export function buildTsQuery(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const terms = text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
    .map((term) => term.slice(0, MAX_TERM_LENGTH))
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return undefined;
  return [...new Set(terms)].map((term) => `${term}:*`).join(' & ');
}
