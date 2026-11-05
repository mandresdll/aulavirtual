import type {
  AdminEnrollment,
  CommunityProfile,
  EnrollmentStatus,
  MyEnrollments,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { Cache } from '../../infra/cache.js';
import type { LmsGateway } from '../../integrations/lms/port.js';
import type { Mailer } from '../../integrations/mailer/port.js';
import { AppError } from '../../lib/errors.js';
import { escapeHtml } from '../../lib/html.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { catalogCacheKeys } from '../catalog/catalog.service.js';
import type { CheckoutService } from '../checkout/checkout.service.js';
import type { PaymentsLogger } from '../payments/payments.service.js';
import { consumeWaitlistHolds, createEnrollment } from './enrollment-records.js';

export interface EnrollmentServiceOptions {
  prisma: PrismaClient;
  lms: LmsGateway;
  mailer: Mailer;
  audit: AuditRecorder;
  cache: Cache;
  checkout: CheckoutService;
  logger: PaymentsLogger;
  webUrl: string;
  /** Enlace al Aula Virtual para el correo de bienvenida. */
  lmsUrl?: string;
  alertEmail?: string;
  now?: () => Date;
}

/** Error que reintentar no arregla (falta configurar la edición). */
export class EnrollmentConfigError extends Error {}

function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = name, ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') || '-' };
}

/**
 * Matrícula en el Aula Virtual (RF-05) e inscripción liberada (RF-04). La matrícula corre en el
 * worker sobre las inscripciones `pending_lms`; quien las crea no depende de la cola ni de Moodle.
 */
export class EnrollmentService {
  private readonly now: () => Date;

  constructor(private readonly options: EnrollmentServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Inscripciones a matricular (las toma el barrido del worker). */
  async pendingIds(): Promise<string[]> {
    const rows = await this.options.prisma.enrollment.findMany({
      where: { status: 'pending_lms' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((row) => row.id);
  }

  /** Matricula una inscripción. Idempotente: Moodle no falla si la persona ya está matriculada. */
  async process(enrollmentId: string): Promise<void> {
    const { prisma, lms } = this.options;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: true, edition: { select: { code: true, moodleCourseId: true } } },
    });
    if (!enrollment || enrollment.status !== 'pending_lms') return;

    const courseId = Number(enrollment.edition.moodleCourseId);
    if (!enrollment.edition.moodleCourseId || !Number.isInteger(courseId)) {
      throw new EnrollmentConfigError(
        `La edición ${enrollment.edition.code} no tiene un curso del Aula Virtual configurado.`,
      );
    }

    const { user } = enrollment;
    let lmsUserId = Number(user.moodleUserId);
    if (!user.moodleUserId) {
      const existing = await lms.findUserByEmail(user.email);
      const lmsUser =
        existing ??
        (await lms.createUser({
          username: user.email,
          email: user.email,
          ...splitName(user.name),
        }));
      lmsUserId = lmsUser.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { moodleUserId: String(lmsUser.id) },
      });
    }

    await lms.enrolUser({ userId: lmsUserId, courseId });
    await prisma.enrollment.updateMany({
      where: { id: enrollmentId, status: 'pending_lms' },
      data: {
        status: 'enrolled',
        enrolledAt: this.now(),
        lmsSyncAttempts: { increment: 1 },
        lastLmsError: null,
      },
    });
  }

  /** Registra un intento fallido que se volverá a intentar. */
  async recordAttempt(enrollmentId: string, message: string): Promise<void> {
    await this.options.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lmsSyncAttempts: { increment: 1 }, lastLmsError: message.slice(0, 1000) },
    });
  }

  /** Sin más reintentos: queda visible en el panel y se avisa a la UTA. */
  async markFailed(enrollmentId: string, message: string): Promise<void> {
    const { prisma, alertEmail, mailer, logger } = this.options;
    const updated = await prisma.enrollment.updateMany({
      where: { id: enrollmentId, status: 'pending_lms' },
      data: {
        status: 'failed',
        lmsSyncAttempts: { increment: 1 },
        lastLmsError: message.slice(0, 1000),
      },
    });
    if (updated.count === 0 || !alertEmail) return;

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { edition: { select: { code: true } } },
    });
    const text =
      `No se pudo matricular una inscripción de la edición ${enrollment.edition.code}: ` +
      `${message}. Revísala en ${this.options.webUrl}/admin/inscripciones.`;
    await mailer
      .send({
        to: alertEmail,
        subject: '[Cursos UTA] Matrícula fallida en el Aula Virtual',
        text,
        html: `<p>${escapeHtml(text)}</p>`,
      })
      .catch((error: unknown) => logger.error({ err: error }, 'Alert email failed'));
  }

  /** Vuelve a dejar pendiente una inscripción fallida (botón «Reintentar» del panel). */
  async retry(enrollmentId: string, actor: AuditActor): Promise<void> {
    const { prisma, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.updateMany({
        where: { id: enrollmentId, status: 'failed' },
        data: { status: 'pending_lms', lmsSyncAttempts: 0 },
      });
      if (updated.count === 0) {
        throw AppError.conflict('NOT_RETRYABLE', 'Esta inscripción ya no está fallida.');
      }
      await audit.record(
        {
          ...actor,
          action: 'enrollment.retry',
          entityType: 'enrollment',
          entityId: enrollmentId,
        },
        tx,
      );
    });
  }

  async list(status: Extract<EnrollmentStatus, 'failed' | 'pending_lms'>) {
    const rows = await this.options.prisma.enrollment.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        edition: { select: { code: true, course: { select: { title: true } } } },
      },
    });
    return rows.map((row): AdminEnrollment => ({
      id: row.id,
      status: row.status,
      source: row.source,
      attempts: row.lmsSyncAttempts,
      lastError: row.lastLmsError,
      user: row.user,
      courseTitle: row.edition.course.title,
      editionCode: row.edition.code,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Correo de bienvenida. Va aparte de la matrícula: si falla, se reintenta en la otra pasada. */
  async sendWelcomes(): Promise<number> {
    const { prisma, mailer, logger, webUrl, lmsUrl } = this.options;
    const pending = await prisma.enrollment.findMany({
      where: { status: 'enrolled', welcomeSentAt: null },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
        edition: { select: { code: true, course: { select: { title: true } } } },
      },
    });
    const accessUrl = lmsUrl ?? webUrl;
    let sent = 0;
    for (const enrollment of pending) {
      const title = enrollment.edition.course.title;
      try {
        await mailer.send({
          to: enrollment.user.email,
          subject: `Ya estás inscrito: ${title}`,
          text:
            `Hola ${enrollment.user.name}:\n\nYa tienes acceso a ${title} ` +
            `(edición ${enrollment.edition.code}).\n` +
            `Ingresa al Aula Virtual: ${accessUrl}\n\n` +
            `Si eres nuevo en el Aula Virtual, recibirás tu contraseña en un correo aparte.\n`,
          html:
            `<p>Hola ${escapeHtml(enrollment.user.name)}:</p>` +
            `<p>Ya tienes acceso a <strong>${escapeHtml(title)}</strong> ` +
            `(edición ${escapeHtml(enrollment.edition.code)}).</p>` +
            `<p><a href="${escapeHtml(accessUrl)}">Ingresar al Aula Virtual</a></p>` +
            `<p>Si eres nuevo en el Aula Virtual, recibirás tu contraseña en un correo aparte.</p>`,
        });
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { welcomeSentAt: this.now() },
        });
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, enrollmentId: enrollment.id }, 'Welcome email failed');
      }
    }
    return sent;
  }

  /** Desmatricula en el Aula Virtual a quienes se retiraron (p. ej. por devolución total). */
  async syncWithdrawals(): Promise<number> {
    const { prisma, lms, logger } = this.options;
    const pending = await prisma.enrollment.findMany({
      where: { status: 'withdrawn', enrolledAt: { not: null }, lmsUnenrolledAt: null },
      take: 50,
      include: {
        user: { select: { moodleUserId: true } },
        edition: { select: { moodleCourseId: true } },
      },
    });
    let synced = 0;
    for (const enrollment of pending) {
      const { moodleUserId } = enrollment.user;
      const { moodleCourseId } = enrollment.edition;
      try {
        if (moodleUserId && moodleCourseId) {
          await lms.unenrolUser({ userId: Number(moodleUserId), courseId: Number(moodleCourseId) });
        }
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { lmsUnenrolledAt: this.now() },
        });
        synced += 1;
      } catch (error) {
        logger.warn({ err: error, enrollmentId: enrollment.id }, 'LMS unenrol failed');
      }
    }
    return synced;
  }

  /** Inscripción sin pago para la comunidad CFT (RF-04), con el mismo control de cupos. */
  async enrollFree(
    user: { id: string; profiles: readonly CommunityProfile[] },
    editionId: string,
    actor: AuditActor,
  ): Promise<void> {
    const { prisma, audit, checkout, cache } = this.options;
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM course_editions WHERE id = ${editionId}::uuid FOR UPDATE`;
        const [item] = await checkout.availability(tx, [editionId], user.id);
        if (!item) throw AppError.notFound('La edición no existe.');
        const { edition, reason } = item;
        const eligible =
          edition.freeForCommunity &&
          edition.communityProfiles.some((profile) => user.profiles.includes(profile));
        if (!eligible) {
          throw AppError.forbidden('Esta edición no está liberada para tu perfil.');
        }
        if (reason) throw AppError.conflict('NOT_AVAILABLE', reason);

        await createEnrollment(tx, {
          userId: user.id,
          editionId,
          source: 'free_institutional',
        });
        await consumeWaitlistHolds(tx, user.id, [editionId]);
        await audit.record(
          {
            ...actor,
            action: 'enrollment.free',
            entityType: 'course_edition',
            entityId: editionId,
            after: { userId: user.id, profiles: user.profiles },
          },
          tx,
        );
      },
      { maxWait: 15_000, timeout: 20_000 },
    );
    await cache.delete([catalogCacheKeys.seats(editionId)]);
  }

  /** Lo que el usuario tiene por edición, para decidir qué ofrecer en la ficha. */
  async mine(userId: string): Promise<MyEnrollments> {
    const { prisma } = this.options;
    const [enrollments, entries] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId, status: { not: 'withdrawn' } },
        select: { editionId: true },
      }),
      prisma.waitlistEntry.findMany({
        where: { userId, status: { in: ['waiting', 'notified'] } },
        select: { editionId: true, status: true, position: true, expiresAt: true },
      }),
    ]);
    const waitlist = await Promise.all(
      entries.map(async (entry) => {
        if (entry.status === 'notified') {
          return {
            editionId: entry.editionId,
            position: null,
            offerExpiresAt: entry.expiresAt?.toISOString() ?? null,
          };
        }
        const ahead = await prisma.waitlistEntry.count({
          where: {
            editionId: entry.editionId,
            status: 'waiting',
            position: { lt: entry.position },
          },
        });
        return { editionId: entry.editionId, position: ahead + 1, offerExpiresAt: null };
      }),
    );
    return { enrolledEditionIds: enrollments.map((item) => item.editionId), waitlist };
  }
}
