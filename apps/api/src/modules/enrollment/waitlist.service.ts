import type { AdminWaitlistEntry } from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '../../integrations/mailer/port.js';
import { AppError } from '../../lib/errors.js';
import { escapeHtml } from '../../lib/html.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { isEnrollmentOpen } from '../catalog/catalog.service.js';
import { SOLD_OUT, type CheckoutService } from '../checkout/checkout.service.js';
import type { PaymentsLogger } from '../payments/payments.service.js';

export interface WaitlistServiceOptions {
  prisma: PrismaClient;
  mailer: Mailer;
  audit: AuditRecorder;
  checkout: CheckoutService;
  logger: PaymentsLogger;
  webUrl: string;
  offerHours: number;
  now?: () => Date;
}

/**
 * Lista de espera (RF-05). Cuando hay un cupo libre, el worker le retiene una reserva sin orden al
 * siguiente de la fila y le avisa por correo. Detectar los cupos por barrido cubre todas las
 * causas (devolución, retiro, aumento de cupos, orden vencida) sin engancharse a cada una.
 */
export class WaitlistService {
  private readonly now: () => Date;

  constructor(private readonly options: WaitlistServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async join(userId: string, editionId: string, actor: AuditActor): Promise<void> {
    const { prisma, checkout, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM course_editions WHERE id = ${editionId}::uuid FOR UPDATE`;
      const [item] = await checkout.availability(tx, [editionId], userId);
      if (!item) throw AppError.notFound('La edición no existe.');
      if (item.reason !== SOLD_OUT) {
        throw AppError.conflict(
          'WAITLIST_NOT_NEEDED',
          item.reason ?? 'Esta edición tiene cupos disponibles: puedes inscribirte directamente.',
        );
      }

      const existing = await tx.waitlistEntry.findUnique({
        where: { editionId_userId: { editionId, userId } },
      });
      if (existing && ['waiting', 'notified'].includes(existing.status)) return;

      const last = await tx.waitlistEntry.aggregate({
        where: { editionId },
        _max: { position: true },
      });
      const position = (last._max.position ?? 0) + 1;
      const data = { position, status: 'waiting' as const, notifiedAt: null, expiresAt: null };
      await tx.waitlistEntry.upsert({
        where: { editionId_userId: { editionId, userId } },
        create: { editionId, userId, ...data },
        update: data,
      });
      await audit.record(
        { ...actor, action: 'waitlist.join', entityType: 'course_edition', entityId: editionId },
        tx,
      );
    });
  }

  async leave(userId: string, editionId: string, actor: AuditActor): Promise<void> {
    const { prisma, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.waitlistEntry.updateMany({
        where: { userId, editionId, status: { in: ['waiting', 'notified'] } },
        data: { status: 'cancelled' },
      });
      if (updated.count === 0) return;
      await tx.seatReservation.updateMany({
        where: { userId, editionId, orderId: null, status: 'active' },
        data: { status: 'released' },
      });
      await audit.record(
        { ...actor, action: 'waitlist.leave', entityType: 'course_edition', entityId: editionId },
        tx,
      );
    });
  }

  /** Vence ofertas sin usar y ofrece los cupos libres al siguiente de cada fila. */
  async advance(): Promise<number> {
    const { prisma } = this.options;
    const now = this.now();

    await prisma.$transaction(async (tx) => {
      await tx.waitlistEntry.updateMany({
        where: { status: 'notified', expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
      await tx.seatReservation.updateMany({
        where: { orderId: null, status: 'active', expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
    });

    const editions = await prisma.waitlistEntry.groupBy({
      by: ['editionId'],
      where: { status: 'waiting' },
    });
    let offered = 0;
    for (const { editionId } of editions) offered += await this.offerSeats(editionId, now);
    return offered;
  }

  private async offerSeats(editionId: string, now: Date): Promise<number> {
    const { prisma, audit, offerHours } = this.options;
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM course_editions WHERE id = ${editionId}::uuid FOR UPDATE`;
      const edition = await tx.courseEdition.findUniqueOrThrow({
        where: { id: editionId },
        include: { course: { select: { status: true } } },
      });
      const open = isEnrollmentOpen(
        {
          enrollmentOpensAt: edition.enrollmentOpensAt?.toISOString() ?? null,
          enrollmentClosesAt: edition.enrollmentClosesAt.toISOString(),
        },
        now,
      );
      if (edition.status !== 'published' || edition.course.status !== 'published' || !open) {
        return 0;
      }

      const [taken, reserved] = await Promise.all([
        tx.enrollment.count({ where: { editionId, status: { not: 'withdrawn' } } }),
        tx.seatReservation.count({
          where: { editionId, status: 'active', expiresAt: { gt: now } },
        }),
      ]);
      const free = edition.capacity - taken - reserved;
      if (free <= 0) return 0;

      const next = await tx.waitlistEntry.findMany({
        where: { editionId, status: 'waiting' },
        orderBy: { position: 'asc' },
        take: free,
      });
      const limit = now.getTime() + offerHours * 3_600_000;
      const expiresAt = new Date(Math.min(limit, edition.enrollmentClosesAt.getTime()));
      for (const entry of next) {
        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'notified', expiresAt },
        });
        await tx.seatReservation.create({
          data: { editionId, userId: entry.userId, expiresAt },
        });
        await audit.record(
          {
            actorId: null,
            actorRole: null,
            action: 'waitlist.offer',
            entityType: 'course_edition',
            entityId: editionId,
            after: { userId: entry.userId, expiresAt: expiresAt.toISOString() },
          },
          tx,
        );
      }
      return next.length;
    });
  }

  /** Avisa por correo las ofertas nuevas; `notifiedAt` queda vacío hasta lograr el envío. */
  async sendOffers(): Promise<number> {
    const { prisma, mailer, logger, webUrl } = this.options;
    const pending = await prisma.waitlistEntry.findMany({
      where: { status: 'notified', notifiedAt: null },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
        edition: { select: { code: true, course: { select: { title: true, slug: true } } } },
      },
    });
    let sent = 0;
    for (const entry of pending) {
      const { title, slug } = entry.edition.course;
      const url = `${webUrl}/cursos/${slug}`;
      const until = entry.expiresAt?.toISOString() ?? '';
      try {
        await mailer.send({
          to: entry.user.email,
          subject: `Se liberó un cupo: ${title}`,
          text:
            `Hola ${entry.user.name}:\n\nSe liberó un cupo en ${title} ` +
            `(edición ${entry.edition.code}) y lo retenemos para ti.\n` +
            `Ingresa y completa tu inscripción antes de ${until}: ${url}\n`,
          html:
            `<p>Hola ${escapeHtml(entry.user.name)}:</p>` +
            `<p>Se liberó un cupo en <strong>${escapeHtml(title)}</strong> ` +
            `(edición ${escapeHtml(entry.edition.code)}) y lo retenemos para ti.</p>` +
            `<p><a href="${escapeHtml(url)}">Completar mi inscripción</a></p>`,
        });
        await prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: { notifiedAt: this.now() },
        });
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, entryId: entry.id }, 'Waitlist email failed');
      }
    }
    return sent;
  }

  async adminList(): Promise<AdminWaitlistEntry[]> {
    const rows = await this.options.prisma.waitlistEntry.findMany({
      where: { status: { in: ['waiting', 'notified'] } },
      orderBy: [{ editionId: 'asc' }, { position: 'asc' }],
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        edition: { select: { code: true, course: { select: { title: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      courseTitle: row.edition.course.title,
      editionCode: row.edition.code,
      position: row.position,
      status: row.status as AdminWaitlistEntry['status'],
      user: row.user,
      offerExpiresAt: row.status === 'notified' ? (row.expiresAt?.toISOString() ?? null) : null,
    }));
  }
}
