import { randomBytes } from 'node:crypto';
import {
  LEAD_CONSENT,
  toLocalIsoDate,
  type AdminLeadsQuery,
  type LeadRequest,
  type PageView,
} from '@plataforma/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import { paginate } from '../admin/support.js';

export interface LeadsServiceOptions {
  prisma: PrismaClient;
  audit: AuditRecorder;
  /** Días que se conserva a quien se dio de baja. */
  retentionDays: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Interesados con consentimiento, bajas y visitas a las fichas (RF-02, Ley 21.719). */
export class LeadsService {
  private readonly now: () => Date;

  constructor(private readonly options: LeadsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Registra un interesado. El texto aceptado lo pone el servidor, nunca el navegador. Volver a
   * inscribirse renueva el consentimiento, también si la persona se había dado de baja.
   */
  async subscribe(input: LeadRequest): Promise<void> {
    const { prisma } = this.options;
    if (input.consentVersion !== LEAD_CONSENT.version) {
      throw AppError.conflict(
        'CONSENT_OUTDATED',
        'El texto de consentimiento cambió. Recarga la página y vuelve a aceptarlo.',
      );
    }
    const course = input.courseSlug
      ? await prisma.course.findUnique({ where: { slug: input.courseSlug }, select: { id: true } })
      : null;
    const data = {
      name: input.name ?? null,
      consentText: LEAD_CONSENT.text,
      consentVersion: LEAD_CONSENT.version,
      consentedAt: this.now(),
      status: 'active' as const,
      unsubscribedAt: null,
      utmSource: input.utm?.source ?? null,
      utmMedium: input.utm?.medium ?? null,
      utmCampaign: input.utm?.campaign ?? null,
      utmTerm: input.utm?.term ?? null,
      utmContent: input.utm?.content ?? null,
    };
    const courseId = course?.id ?? null;
    const existing = await prisma.lead.findFirst({
      where: { email: input.email, courseId },
      select: { id: true },
    });
    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data });
      return;
    }
    await prisma.lead.create({
      data: {
        ...data,
        email: input.email,
        courseId,
        unsubscribeToken: randomBytes(32).toString('hex'),
      },
    });
  }

  /** Baja en un clic: alcanza a todos los registros del mismo correo. Se puede repetir. */
  async unsubscribe(token: string): Promise<void> {
    const { prisma, audit } = this.options;
    const lead = await prisma.lead.findUnique({ where: { unsubscribeToken: token } });
    if (!lead) throw AppError.notFound('El enlace de baja no es válido.');
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lead.updateMany({
        where: { email: lead.email, status: 'active' },
        data: { status: 'unsubscribed', unsubscribedAt: this.now() },
      });
      if (count > 0) {
        await audit.record(
          {
            actorId: null,
            actorRole: null,
            action: 'lead.unsubscribe',
            entityType: 'lead',
            entityId: lead.id,
          },
          tx,
        );
      }
    });
  }

  /** Retención: borra a quienes se dieron de baja hace más del plazo. */
  async purgeUnsubscribed(): Promise<number> {
    const { prisma, retentionDays } = this.options;
    const cutoff = new Date(this.now().getTime() - retentionDays * DAY_MS);
    const { count } = await prisma.lead.deleteMany({
      where: { status: 'unsubscribed', unsubscribedAt: { lt: cutoff } },
    });
    return count;
  }

  async list(query: AdminLeadsQuery) {
    const { prisma } = this.options;
    const contains = query.q ? { contains: query.q, mode: 'insensitive' as const } : null;
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(contains ? { OR: [{ email: contains }, { name: contains }] } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: { course: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        courseTitle: row.course?.title ?? null,
        status: row.status,
        consentVersion: row.consentVersion,
        consentedAt: row.consentedAt.toISOString(),
        utmCampaign: row.utmCampaign,
      })),
      ...paginate(query.page, query.pageSize, total),
    };
  }

  /** Suma una visita al contador del día. Sin cookies, IP ni usuario. */
  async recordView(slug: string, input: PageView): Promise<void> {
    const { prisma } = this.options;
    const course = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (!course) return;
    const key = {
      day: toLocalIsoDate(this.now()),
      courseId: course.id,
      utmSource: input.utm?.source ?? '',
      utmMedium: input.utm?.medium ?? '',
      utmCampaign: input.utm?.campaign ?? '',
    };
    try {
      await prisma.coursePageView.upsert({
        where: { day_courseId_utmSource_utmMedium_utmCampaign: key },
        create: { ...key, views: 1 },
        update: { views: { increment: 1 } },
      });
    } catch (error) {
      // Dos primeras visitas simultáneas chocan al crear la fila: la segunda solo suma.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      await prisma.coursePageView.update({
        where: { day_courseId_utmSource_utmMedium_utmCampaign: key },
        data: { views: { increment: 1 } },
      });
    }
  }
}
