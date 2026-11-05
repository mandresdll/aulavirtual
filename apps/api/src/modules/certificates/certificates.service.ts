import type {
  AdminCertificate,
  AdminEnrollment,
  MyCourses,
  ProviderInfo,
  SyncResults,
  Verification,
} from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { CertificateValidator } from '../../integrations/certificate-validator/port.js';
import { IntegrationError } from '../../integrations/errors.js';
import type { LmsGateway } from '../../integrations/lms/port.js';
import type { Mailer } from '../../integrations/mailer/port.js';
import { AppError } from '../../lib/errors.js';
import { escapeHtml } from '../../lib/html.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import type { PaymentsLogger } from '../payments/payments.service.js';
import { buildCertificatePdf, sha256Hex } from './certificate-pdf.js';
import { decideResult, generateCertificateCode, normalizeCertificateCode } from './rules.js';

export interface CertificatesServiceOptions {
  prisma: PrismaClient;
  lms: LmsGateway;
  validator: CertificateValidator;
  mailer: Mailer;
  audit: AuditRecorder;
  logger: PaymentsLogger;
  provider: ProviderInfo;
  webUrl: string;
  graceDays: number;
  lmsUrl?: string;
  now?: () => Date;
}

const NOT_FOUND = 'El certificado no existe.';
const BATCH = 200;

const certificateInclude = {
  enrollment: {
    include: {
      user: { select: { email: true } },
      edition: {
        select: {
          code: true,
          startsAt: true,
          endsAt: true,
          course: { select: { title: true, durationHours: true } },
        },
      },
    },
  },
} satisfies Prisma.CertificateInclude;
type CertificateRow = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>;

const enrollmentInclude = {
  user: { select: { name: true, moodleUserId: true } },
  edition: {
    select: {
      moodleCourseId: true,
      passingCriterion: true,
      passingGrade: true,
      startsAt: true,
      endsAt: true,
      course: { select: { title: true, durationHours: true } },
    },
  },
} satisfies Prisma.EnrollmentInclude;
type EnrollmentRow = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

/**
 * Aprobación y certificados (RF-06). Emitir es parte de la transacción que aprueba; el correo y
 * la publicación en el validador son pasos aparte del worker: si fallan, el certificado sigue
 * siendo válido en la verificación propia y se reintenta.
 */
export class CertificatesService {
  private readonly now: () => Date;

  constructor(private readonly options: CertificatesServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private verificationUrl(code: string): string {
    return `${this.options.webUrl}/verificar/${code}`;
  }

  /** Consulta en el Aula Virtual a los matriculados y aplica el resultado. */
  async syncResults(editionId?: string): Promise<SyncResults> {
    const { prisma, lms, logger, graceDays } = this.options;
    const now = this.now();
    const summary = { checked: 0, completed: 0, failed: 0 };
    let cursor: string | undefined;

    for (;;) {
      const batch: EnrollmentRow[] = await prisma.enrollment.findMany({
        where: {
          status: 'enrolled',
          user: { moodleUserId: { not: null } },
          edition: {
            startsAt: { lte: now },
            moodleCourseId: { not: null },
            ...(editionId ? { id: editionId } : {}),
          },
        },
        include: enrollmentInclude,
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (batch.length === 0) return summary;
      cursor = batch[batch.length - 1]?.id;

      for (const enrollment of batch) {
        summary.checked += 1;
        try {
          const completion = await lms.getCourseCompletion({
            userId: Number(enrollment.user.moodleUserId),
            courseId: Number(enrollment.edition.moodleCourseId),
          });
          const result = decideResult({
            criterion: enrollment.edition.passingCriterion,
            passingGrade: enrollment.edition.passingGrade?.toNumber() ?? null,
            completed: completion.completed,
            grade: completion.grade,
            endsAt: enrollment.edition.endsAt,
            now,
            graceDays,
          });
          if (result === 'completed') {
            await this.approve(enrollment, completion.grade, {
              actorId: null,
              actorRole: null,
            });
            summary.completed += 1;
          } else if (result === 'failed_course') {
            await prisma.enrollment.updateMany({
              where: { id: enrollment.id, status: 'enrolled' },
              data: { status: 'failed_course', grade: completion.grade },
            });
            summary.failed += 1;
          }
        } catch (error) {
          logger.warn({ err: error, enrollmentId: enrollment.id }, 'Course result sync failed');
        }
      }
    }
  }

  private async approve(
    enrollment: EnrollmentRow,
    grade: number | null,
    actor: AuditActor,
  ): Promise<void> {
    const issuedAt = this.now();
    await this.options.prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.updateMany({
        where: { id: enrollment.id, status: 'enrolled' },
        data: { status: 'completed', completedAt: issuedAt, grade },
      });
      if (updated.count === 0) return;
      await this.issue(tx, enrollment, enrollment.user.name, issuedAt, actor);
    });
  }

  private async issue(
    tx: Prisma.TransactionClient,
    enrollment: Pick<EnrollmentRow, 'id' | 'edition' | 'grade'>,
    recipientName: string,
    issuedAt: Date,
    actor: AuditActor,
    previousCertificateId?: string,
  ) {
    const code = generateCertificateCode();
    const { edition } = enrollment;
    const pdf = await buildCertificatePdf(
      {
        code,
        recipientName,
        courseTitle: edition.course.title,
        hours: edition.course.durationHours,
        startsAt: edition.startsAt,
        endsAt: edition.endsAt,
        issuedAt,
        verificationUrl: this.verificationUrl(code),
      },
      this.options.provider,
    );
    const certificate = await tx.certificate.create({
      data: {
        enrollmentId: enrollment.id,
        code,
        recipientName,
        grade: enrollment.grade,
        issuedAt,
        pdfSha256: sha256Hex(pdf),
        ...(previousCertificateId ? { previousCertificateId } : {}),
      },
    });
    await this.options.audit.record(
      {
        ...actor,
        action: previousCertificateId ? 'certificate.reissue' : 'certificate.issue',
        entityType: 'certificate',
        entityId: certificate.id,
        after: { code, recipientName },
      },
      tx,
    );
    return certificate;
  }

  /** Verificación pública: válido, revocado, reemplazado o no existe. */
  async verify(input: string): Promise<Verification> {
    const code = normalizeCertificateCode(input);
    if (!code) return { status: 'not_found' };
    const certificate = await this.options.prisma.certificate.findUnique({
      where: { code },
      include: {
        ...certificateInclude,
        reissuedAs: { select: { code: true, status: true } },
      },
    });
    if (!certificate) return { status: 'not_found' };
    if (certificate.status === 'revoked') {
      return {
        status: 'revoked',
        code,
        revokedAt: (certificate.revokedAt ?? certificate.updatedAt).toISOString(),
      };
    }
    if (certificate.status === 'reissued') {
      return { status: 'reissued', code, replacedBy: certificate.reissuedAs?.code ?? null };
    }
    const { edition } = certificate.enrollment;
    return {
      status: 'valid',
      code,
      holderName: certificate.recipientName,
      courseTitle: edition.course.title,
      hours: edition.course.durationHours,
      issuedAt: certificate.issuedAt.toISOString(),
    };
  }

  private buildPdf(certificate: CertificateRow): Promise<Uint8Array> {
    const { edition } = certificate.enrollment;
    return buildCertificatePdf(
      {
        code: certificate.code,
        recipientName: certificate.recipientName,
        courseTitle: edition.course.title,
        hours: edition.course.durationHours,
        startsAt: edition.startsAt,
        endsAt: edition.endsAt,
        issuedAt: certificate.issuedAt,
        verificationUrl: this.verificationUrl(certificate.code),
      },
      this.options.provider,
    );
  }

  /** PDF de un certificado vigente del propio usuario. */
  async pdfFor(userId: string, input: string): Promise<{ code: string; pdf: Uint8Array }> {
    const code = normalizeCertificateCode(input);
    const certificate = code
      ? await this.options.prisma.certificate.findUnique({
          where: { code },
          include: certificateInclude,
        })
      : null;
    if (
      !certificate ||
      certificate.enrollment.userId !== userId ||
      certificate.status !== 'valid'
    ) {
      throw AppError.notFound(NOT_FOUND);
    }
    return { code: certificate.code, pdf: await this.buildPdf(certificate) };
  }

  async myCourses(userId: string): Promise<MyCourses> {
    const rows = await this.options.prisma.enrollment.findMany({
      where: { userId, status: { not: 'withdrawn' } },
      orderBy: { createdAt: 'desc' },
      include: {
        edition: {
          select: {
            code: true,
            startsAt: true,
            endsAt: true,
            course: { select: { title: true, slug: true } },
          },
        },
        certificates: { where: { status: 'valid' }, select: { code: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        editionId: row.editionId,
        courseTitle: row.edition.course.title,
        courseSlug: row.edition.course.slug,
        editionCode: row.edition.code,
        status: row.status,
        startsAt: row.edition.startsAt.toISOString(),
        endsAt: row.edition.endsAt.toISOString(),
        certificateCode: row.certificates[0]?.code ?? null,
      })),
      lmsUrl: this.options.lmsUrl ?? null,
    };
  }

  async search(q: string): Promise<AdminCertificate[]> {
    const code = normalizeCertificateCode(q);
    const rows = await this.options.prisma.certificate.findMany({
      where: {
        OR: [
          ...(code ? [{ code }] : []),
          { recipientName: { contains: q, mode: 'insensitive' as const } },
          { enrollment: { user: { email: { contains: q, mode: 'insensitive' as const } } } },
        ],
      },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: certificateInclude,
    });
    return rows.map(toAdmin);
  }

  private async valid(tx: Prisma.TransactionClient, id: string) {
    const certificate = await tx.certificate.findUnique({
      where: { id },
      include: {
        enrollment: { include: { edition: { select: enrollmentInclude.edition.select } } },
      },
    });
    if (!certificate) throw AppError.notFound(NOT_FOUND);
    if (certificate.status !== 'valid') {
      throw AppError.conflict('CERTIFICATE_NOT_VALID', 'Este certificado ya no está vigente.');
    }
    return certificate;
  }

  /** Corrección de nombre: certificado nuevo con código nuevo; el anterior queda enlazado. */
  async reissue(id: string, recipientName: string, actor: AuditActor): Promise<AdminCertificate> {
    const { prisma } = this.options;
    const created = await prisma.$transaction(async (tx) => {
      const previous = await this.valid(tx, id);
      const updated = await tx.certificate.updateMany({
        where: { id, status: 'valid' },
        data: { status: 'reissued', validatorSyncStatus: 'pending' },
      });
      if (updated.count === 0) {
        throw AppError.conflict('CERTIFICATE_NOT_VALID', 'Este certificado ya no está vigente.');
      }
      return this.issue(tx, previous.enrollment, recipientName, this.now(), actor, id);
    });
    const certificate = await prisma.certificate.findUniqueOrThrow({
      where: { id: created.id },
      include: certificateInclude,
    });
    return toAdmin(certificate);
  }

  async revoke(id: string, reason: string, actor: AuditActor): Promise<AdminCertificate> {
    const { prisma, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      await this.valid(tx, id);
      await tx.certificate.update({
        where: { id },
        data: {
          status: 'revoked',
          revokedAt: this.now(),
          revocationReason: reason,
          validatorSyncStatus: 'pending',
        },
      });
      await audit.record(
        {
          ...actor,
          action: 'certificate.revoke',
          entityType: 'certificate',
          entityId: id,
          after: { reason },
        },
        tx,
      );
    });
    const certificate = await prisma.certificate.findUniqueOrThrow({
      where: { id },
      include: certificateInclude,
    });
    return toAdmin(certificate);
  }

  /** Cursos por nota sin nota, pasado el plazo: los decide la UTA. */
  async needsReview(): Promise<AdminEnrollment[]> {
    const limit = new Date(this.now().getTime() - this.options.graceDays * 86_400_000);
    const rows = await this.options.prisma.enrollment.findMany({
      where: {
        status: 'enrolled',
        grade: null,
        edition: { passingCriterion: 'grade', endsAt: { lte: limit } },
      },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        edition: { select: { code: true, course: { select: { title: true } } } },
      },
    });
    return rows.map((row) => ({
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

  /** Decisión manual de la UTA sobre una inscripción matriculada. */
  async decide(
    enrollmentId: string,
    result: 'completed' | 'failed_course',
    actor: AuditActor,
  ): Promise<void> {
    const { prisma, audit } = this.options;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: enrollmentInclude,
    });
    if (!enrollment) throw AppError.notFound('La inscripción no existe.');
    if (enrollment.status !== 'enrolled') {
      throw AppError.conflict('NOT_DECIDABLE', 'Esta inscripción ya tiene un resultado.');
    }
    if (result === 'completed') {
      await this.approve(enrollment, null, actor);
    } else {
      await prisma.enrollment.updateMany({
        where: { id: enrollmentId, status: 'enrolled' },
        data: { status: 'failed_course' },
      });
    }
    await audit.record({
      ...actor,
      action: 'enrollment.result',
      entityType: 'enrollment',
      entityId: enrollmentId,
      after: { result },
    });
  }

  /** Envía por correo los certificados nuevos; se reintenta en la siguiente pasada si falla. */
  async sendPending(): Promise<number> {
    const { prisma, mailer, logger, webUrl } = this.options;
    const pending = await prisma.certificate.findMany({
      where: { status: 'valid', emailSentAt: null },
      take: 50,
      include: certificateInclude,
    });
    let sent = 0;
    for (const certificate of pending) {
      const title = certificate.enrollment.edition.course.title;
      const url = this.verificationUrl(certificate.code);
      try {
        const pdf = await this.buildPdf(certificate);
        await mailer.send({
          to: certificate.enrollment.user.email,
          subject: `Tu certificado: ${title}`,
          text:
            `Hola ${certificate.recipientName}:\n\nAprobaste ${title}. ` +
            `Adjuntamos tu certificado.\nCódigo: ${certificate.code}\nVerificación: ${url}\n` +
            `También lo encuentras en ${webUrl}/mis-cursos\n`,
          html:
            `<p>Hola ${escapeHtml(certificate.recipientName)}:</p>` +
            `<p>Aprobaste <strong>${escapeHtml(title)}</strong>. Adjuntamos tu certificado.</p>` +
            `<p>Código: <strong>${escapeHtml(certificate.code)}</strong> · ` +
            `<a href="${escapeHtml(url)}">Verificar</a></p>`,
          attachments: [
            {
              filename: `certificado-${certificate.code}.pdf`,
              content: Buffer.from(pdf),
              contentType: 'application/pdf',
            },
          ],
        });
        await prisma.certificate.update({
          where: { id: certificate.id },
          data: { emailSentAt: this.now() },
        });
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, certificateId: certificate.id }, 'Certificate email failed');
      }
    }
    return sent;
  }

  /** Publica en el validador del SGA lo pendiente: certificados nuevos y revocaciones. */
  async syncValidator(): Promise<number> {
    const { prisma, validator, logger } = this.options;
    const pending = await prisma.certificate.findMany({
      where: { validatorSyncStatus: 'pending' },
      take: 50,
      include: certificateInclude,
    });
    let synced = 0;
    for (const certificate of pending) {
      try {
        if (certificate.status === 'valid') {
          const { edition } = certificate.enrollment;
          await validator.register({
            code: certificate.code,
            holderName: certificate.recipientName,
            courseTitle: edition.course.title,
            hours: edition.course.durationHours,
            issuedAt: certificate.issuedAt,
            verificationUrl: this.verificationUrl(certificate.code),
          });
        } else if (certificate.validatorSyncedAt) {
          // Si nunca se publicó, no hay nada que revocar en el validador.
          await validator.revoke({
            code: certificate.code,
            reason: certificate.revocationReason ?? 'Reemplazado por una reemisión',
          });
        }
        await prisma.certificate.update({
          where: { id: certificate.id },
          data: {
            validatorSyncStatus: 'synced',
            validatorSyncedAt: this.now(),
            validatorLastError: null,
          },
        });
        synced += 1;
      } catch (error) {
        const retryable = !(error instanceof IntegrationError) || error.retryable;
        logger.warn({ err: error, certificateId: certificate.id }, 'Validator sync failed');
        await prisma.certificate.update({
          where: { id: certificate.id },
          data: {
            validatorSyncStatus: retryable ? 'pending' : 'failed',
            validatorLastError: (error instanceof Error ? error.message : 'Error').slice(0, 1000),
          },
        });
      }
    }
    return synced;
  }
}

function toAdmin(certificate: CertificateRow): AdminCertificate {
  return {
    id: certificate.id,
    code: certificate.code,
    status: certificate.status,
    recipientName: certificate.recipientName,
    email: certificate.enrollment.user.email,
    courseTitle: certificate.enrollment.edition.course.title,
    editionCode: certificate.enrollment.edition.code,
    issuedAt: certificate.issuedAt.toISOString(),
    revocationReason: certificate.revocationReason,
    validatorSyncStatus: certificate.validatorSyncStatus,
    validatorLastError: certificate.validatorLastError,
  };
}
