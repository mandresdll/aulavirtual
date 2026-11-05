import type { DataSubjectSummary } from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';

export interface PrivacyServiceOptions {
  prisma: PrismaClient;
  audit: AuditRecorder;
  now?: () => Date;
}

type Db = PrismaClient | Prisma.TransactionClient;

const NOT_FOUND = 'No hay datos asociados a ese correo.';
const OPEN_ORDERS = ['pending', 'awaiting_payment', 'refund_requested'] as const;
const ACTIVE_ENROLLMENTS = ['pending_lms', 'enrolled'] as const;

export const ANONYMIZED_NAME = 'Titular anonimizado';

/**
 * Acceso y supresión de datos de un titular (Leyes 19.628 y 21.719). Las órdenes, pagos y documentos
 * no se borran (obligación contable): se quita lo que identifica a la persona y se conserva el
 * resto. El certificado emitido mantiene el nombre para seguir siendo verificable; quien no lo
 * quiera puede pedir su revocación. Ver docs/datos-personales.md.
 */
export class PrivacyService {
  private readonly now: () => Date;

  constructor(private readonly options: PrivacyServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async summary(email: string): Promise<DataSubjectSummary> {
    const { prisma } = this.options;
    const [user, leads] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true, name: true } }),
      prisma.lead.count({ where: { email } }),
    ]);
    if (!user && leads === 0) throw AppError.notFound(NOT_FOUND);
    if (!user) {
      return { name: null, orders: 0, enrollments: 0, certificates: 0, leads, blockedReason: null };
    }
    const [orders, enrollments, certificates, blockedReason] = await Promise.all([
      prisma.order.count({ where: { userId: user.id } }),
      prisma.enrollment.count({ where: { userId: user.id } }),
      prisma.certificate.count({ where: { enrollment: { userId: user.id } } }),
      this.blockedReason(prisma, user.id),
    ]);
    return { name: user.name, orders, enrollments, certificates, leads, blockedReason };
  }

  /** Todo lo que la plataforma guarda de la persona, en un documento legible. */
  async exportData(email: string, actor: AuditActor) {
    const { prisma, audit } = this.options;
    const [user, leads] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        include: {
          orders: {
            include: {
              items: { select: { courseTitle: true, totalClp: true } },
              payments: {
                select: {
                  status: true,
                  amountClp: true,
                  cardLast4: true,
                  paymentType: true,
                  confirmedAt: true,
                },
              },
              refunds: {
                select: { amountClp: true, status: true, reason: true, completedAt: true },
              },
              salesDocument: {
                select: {
                  type: true,
                  receiverRut: true,
                  receiverName: true,
                  receiverActivity: true,
                  receiverAddress: true,
                  externalFolio: true,
                },
              },
            },
          },
          enrollments: {
            include: {
              edition: { select: { code: true, course: { select: { title: true } } } },
              certificates: {
                select: { code: true, recipientName: true, issuedAt: true, status: true },
              },
            },
          },
          waitlistEntries: { select: { editionId: true, status: true, createdAt: true } },
        },
      }),
      prisma.lead.findMany({
        where: { email },
        include: { course: { select: { title: true } } },
      }),
    ]);
    if (!user && leads.length === 0) throw AppError.notFound(NOT_FOUND);

    await audit.record({
      ...actor,
      action: 'data_subject.export',
      entityType: 'user',
      entityId: user?.id ?? null,
    });
    return {
      generatedAt: this.now().toISOString(),
      account: user && {
        email: user.email,
        name: user.name,
        rut: user.rut,
        phone: user.phone,
        createdAt: user.createdAt.toISOString(),
      },
      orders: (user?.orders ?? []).map((order) => ({
        number: order.number,
        status: order.status,
        totalClp: order.totalClp,
        createdAt: order.createdAt.toISOString(),
        legalAcceptedAt: order.legalAcceptedAt?.toISOString() ?? null,
        legalAcceptedIp: order.legalAcceptedIp,
        items: order.items,
        payments: order.payments,
        refunds: order.refunds,
        document: order.salesDocument,
      })),
      enrollments: (user?.enrollments ?? []).map((enrollment) => ({
        course: enrollment.edition.course.title,
        edition: enrollment.edition.code,
        status: enrollment.status,
        grade: enrollment.grade?.toString() ?? null,
        certificates: enrollment.certificates,
      })),
      waitlist: user?.waitlistEntries ?? [],
      interest: leads.map((lead) => ({
        course: lead.course?.title ?? null,
        name: lead.name,
        status: lead.status,
        consentText: lead.consentText,
        consentVersion: lead.consentVersion,
        consentedAt: lead.consentedAt.toISOString(),
        unsubscribedAt: lead.unsubscribedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Quita lo que identifica a la persona. No se puede deshacer. */
  async anonymize(email: string, actor: AuditActor): Promise<void> {
    const { prisma, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
      const leads = await tx.lead.deleteMany({ where: { email } });
      if (!user && leads.count === 0) throw AppError.notFound(NOT_FOUND);

      if (user) {
        const reason = await this.blockedReason(tx, user.id);
        if (reason) throw AppError.conflict('DATA_SUBJECT_BUSY', reason);

        await tx.user.update({
          where: { id: user.id },
          data: {
            email: `anon-${user.id}@anonimizado.invalid`,
            name: ANONYMIZED_NAME,
            rut: null,
            phone: null,
            idpSubject: null,
            sgaUserId: null,
            moodleUserId: null,
          },
        });
        await tx.order.updateMany({
          where: { userId: user.id },
          data: { legalAcceptedIp: null },
        });
        await tx.cart.deleteMany({ where: { userId: user.id } });
        await tx.waitlistEntry.updateMany({
          where: { userId: user.id, status: { in: ['waiting', 'notified'] } },
          data: { status: 'cancelled' },
        });
        await tx.seatReservation.updateMany({
          where: { userId: user.id, status: 'active' },
          data: { status: 'released' },
        });
      }
      await audit.record(
        {
          ...actor,
          action: 'data_subject.anonymize',
          entityType: 'user',
          entityId: user?.id ?? null,
          after: { leadsDeleted: leads.count },
        },
        tx,
      );
    });
  }

  /** Una compra o un curso en curso todavía necesitan a la persona identificada. */
  private async blockedReason(db: Db, userId: string): Promise<string | null> {
    const [orders, enrollments] = await Promise.all([
      db.order.count({ where: { userId, status: { in: [...OPEN_ORDERS] } } }),
      db.enrollment.count({ where: { userId, status: { in: [...ACTIVE_ENROLLMENTS] } } }),
    ]);
    if (orders > 0) return 'Tiene una orden en curso. Espera a que termine o se cancele.';
    if (enrollments > 0) return 'Tiene un curso en curso. Primero debe terminar o retirarse.';
    return null;
  }
}
