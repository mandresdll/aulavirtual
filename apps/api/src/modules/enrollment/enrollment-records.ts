import type { EnrollmentSource, Prisma } from '@prisma/client';

export interface NewEnrollment {
  userId: string;
  editionId: string;
  orderItemId?: string;
  source: EnrollmentSource;
}

/**
 * Crea la inscripción, o reactiva la que quedó `withdrawn`: el índice único usuario + edición
 * impide una segunda fila, y quien recibió una devolución puede volver a inscribirse.
 */
export async function createEnrollment(
  tx: Prisma.TransactionClient,
  enrollment: NewEnrollment,
): Promise<void> {
  const { userId, editionId, orderItemId, source } = enrollment;
  const data = { source, orderItemId: orderItemId ?? null };
  await tx.enrollment.upsert({
    where: { userId_editionId: { userId, editionId } },
    create: { userId, editionId, ...data },
    update: {
      ...data,
      status: 'pending_lms',
      lmsSyncAttempts: 0,
      lastLmsError: null,
      enrolledAt: null,
      welcomeSentAt: null,
      withdrawnAt: null,
      lmsUnenrolledAt: null,
    },
  });
}

/**
 * Al comprar o inscribirse, el cupo retenido por la lista de espera deja de hacer falta y la
 * persona sale de la fila.
 */
export async function consumeWaitlistHolds(
  tx: Prisma.TransactionClient,
  userId: string,
  editionIds: readonly string[],
): Promise<void> {
  await tx.seatReservation.updateMany({
    where: { userId, editionId: { in: [...editionIds] }, orderId: null, status: 'active' },
    data: { status: 'consumed' },
  });
  await tx.waitlistEntry.updateMany({
    where: { userId, editionId: { in: [...editionIds] }, status: { in: ['waiting', 'notified'] } },
    data: { status: 'converted' },
  });
}
