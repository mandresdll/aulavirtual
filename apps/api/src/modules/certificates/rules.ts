import { randomInt } from 'node:crypto';

/** Reglas puras de certificación (RF-06): resultado del curso y código verificable. */

export type CourseResult = 'completed' | 'failed_course' | 'pending' | 'needs_review';

export interface ResultInput {
  criterion: 'completion' | 'grade';
  /** Nota mínima de la edición (criterio `grade`). */
  passingGrade: number | null;
  /** Lo que informa el Aula Virtual. */
  completed: boolean;
  grade: number | null;
  endsAt: Date;
  now: Date;
  /** Días tras el término en que aún pueden llegar notas o correcciones. */
  graceDays: number;
}

/**
 * Moodle informa quién aprobó, no quién reprobó: reprobar se decide por tiempo, pasado el plazo
 * de gracia. Un curso por nota sin nota no se reprueba solo: lo decide la UTA (`needs_review`).
 */
export function decideResult(input: ResultInput): CourseResult {
  const { criterion, passingGrade, completed, grade, endsAt, now, graceDays } = input;
  const approved =
    criterion === 'completion'
      ? completed
      : grade !== null && passingGrade !== null && grade >= passingGrade;
  if (approved) return 'completed';

  if (now.getTime() < endsAt.getTime() + graceDays * 86_400_000) return 'pending';
  return criterion === 'grade' && grade === null ? 'needs_review' : 'failed_course';
}

/** Base32 de Crockford: sin I, L, O ni U, que se confunden al transcribir. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 12;

/** Código no secuencial de 12 caracteres (60 bits aleatorios): `XXXX-XXXX-XXXX`. */
export function generateCertificateCode(): string {
  let code = '';
  for (let index = 0; index < LENGTH; index += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return formatCode(code);
}

const formatCode = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;

/** Normaliza lo que escribe una persona: minúsculas, espacios, sin guiones, O por 0, I/L por 1. */
export function normalizeCertificateCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== LENGTH || [...raw].some((char) => !ALPHABET.includes(char))) return null;
  return formatCode(raw);
}
