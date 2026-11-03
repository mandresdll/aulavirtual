import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';

/** Datos mínimos del usuario que llegan del IdP y del SGA (Ley 21.719: solo lo necesario). */
export interface IdentityUserInput {
  subject: string;
  sgaUserId: string | null;
  email: string;
  name: string;
}

export interface UserRepository {
  /** Crea o actualiza el usuario de la plataforma que corresponde a la identidad. */
  upsertFromIdentity(input: IdentityUserInput): Promise<{ id: string; created: boolean }>;
}

const ACCOUNT_CONFLICT = AppError.conflict(
  'ACCOUNT_CONFLICT',
  'Tu correo ya está asociado a otra cuenta. Contacta a la UTA para revisarlo.',
);

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFromIdentity(input: IdentityUserInput): Promise<{ id: string; created: boolean }> {
    const email = input.email.trim().toLowerCase();
    const matches = await this.prisma.user.findMany({
      where: { OR: [{ idpSubject: input.subject }, { email }] },
      select: { id: true, idpSubject: true },
    });
    const bySubject = matches.find((user) => user.idpSubject === input.subject);
    const existing = bySubject ?? matches[0];

    // El correo pertenece a otra identidad del IdP, o el sujeto y el correo son usuarios distintos.
    if (
      (existing && existing.idpSubject !== null && existing.idpSubject !== input.subject) ||
      (bySubject && matches.length > 1)
    ) {
      throw ACCOUNT_CONFLICT;
    }

    const data = {
      idpSubject: input.subject,
      email,
      name: input.name,
      ...(input.sgaUserId ? { sgaUserId: input.sgaUserId } : {}),
    };
    if (existing) {
      await this.prisma.user.update({ where: { id: existing.id }, data });
      return { id: existing.id, created: false };
    }
    const user = await this.prisma.user.create({ data, select: { id: true } });
    return { id: user.id, created: true };
  }
}
