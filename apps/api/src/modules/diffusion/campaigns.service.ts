import type { AdminCampaign, CampaignInput } from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { Mailer } from '../../integrations/mailer/port.js';
import { AppError } from '../../lib/errors.js';
import { escapeHtml } from '../../lib/html.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';

export interface CampaignsServiceOptions {
  prisma: PrismaClient;
  mailer: Mailer;
  audit: AuditRecorder;
  logger: Pick<Logger, 'warn'>;
  webUrl: string;
  now?: () => Date;
}

const SWEEP_BATCH = 100;

type CampaignRow = Prisma.CampaignGetPayload<object>;

/** Cuerpo del correo de novedades con su enlace de baja. */
export function renderCampaign(body: string, unsubscribeUrl: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const notice = 'Recibes este correo porque aceptaste recibir novedades de los cursos UTA.';
  return {
    text: `${body}\n\n--\n${notice}\nDarte de baja: ${unsubscribeUrl}\n`,
    html:
      `${paragraphs}<hr><p>${notice} ` +
      `<a href="${escapeHtml(unsubscribeUrl)}">Darte de baja</a></p>`,
  };
}

/** Novedades a quienes consintieron (RF-02): el panel las encola y el worker las envía por tandas. */
export class CampaignsService {
  private readonly now: () => Date;

  constructor(private readonly options: CampaignsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list() {
    const { prisma } = this.options;
    const [campaigns, counts, audience] = await Promise.all([
      prisma.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.campaignDelivery.groupBy({ by: ['campaignId', 'status'], _count: { _all: true } }),
      prisma.lead.findMany({
        where: { status: 'active' },
        distinct: ['email'],
        select: { email: true },
      }),
    ]);
    const tally = (id: string, status?: string) =>
      counts
        .filter((row) => row.campaignId === id && (!status || row.status === status))
        .reduce((sum, row) => sum + row._count._all, 0);
    return {
      items: campaigns.map((row) => ({
        ...this.toAdmin(row),
        recipients: tally(row.id),
        sent: tally(row.id, 'sent'),
        failed: tally(row.id, 'failed'),
      })),
      audience: audience.length,
    };
  }

  async create(input: CampaignInput, actor: AuditActor): Promise<AdminCampaign> {
    const { prisma, audit } = this.options;
    const row = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({ data: input });
      await audit.record(
        {
          ...actor,
          action: 'campaign.create',
          entityType: 'campaign',
          entityId: campaign.id,
          after: { subject: input.subject },
        },
        tx,
      );
      return campaign;
    });
    return { ...this.toAdmin(row), recipients: 0, sent: 0, failed: 0 };
  }

  /** Encola una entrega por correo distinto entre quienes siguen suscritos. */
  async send(id: string, actor: AuditActor): Promise<AdminCampaign> {
    const { prisma, audit } = this.options;
    const { row, recipients } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${id}::uuid FOR UPDATE`;
      const campaign = await tx.campaign.findUnique({ where: { id } });
      if (!campaign) throw AppError.notFound('La campaña no existe.');
      if (campaign.status !== 'draft') {
        throw AppError.conflict('CAMPAIGN_ALREADY_SENT', 'Esta campaña ya se envió.');
      }
      const leads = await tx.lead.findMany({
        where: { status: 'active' },
        distinct: ['email'],
        orderBy: [{ email: 'asc' }, { createdAt: 'desc' }],
        select: { id: true },
      });
      if (leads.length === 0) {
        throw AppError.conflict('CAMPAIGN_NO_AUDIENCE', 'No hay interesados suscritos.');
      }
      await tx.campaignDelivery.createMany({
        data: leads.map((lead) => ({ campaignId: id, leadId: lead.id })),
      });
      const row = await tx.campaign.update({ where: { id }, data: { status: 'sending' } });
      await audit.record(
        {
          ...actor,
          action: 'campaign.send',
          entityType: 'campaign',
          entityId: id,
          after: { recipients: leads.length },
        },
        tx,
      );
      return { row, recipients: leads.length };
    });
    return { ...this.toAdmin(row), recipients, sent: 0, failed: 0 };
  }

  /** Barrido del worker: quien se dio de baja después de encolar ya no recibe el correo. */
  async sendPending(): Promise<number> {
    const { prisma, mailer, logger, webUrl } = this.options;
    const deliveries = await prisma.campaignDelivery.findMany({
      where: { status: 'pending' },
      include: { campaign: true, lead: true },
      take: SWEEP_BATCH,
    });
    let sent = 0;
    for (const delivery of deliveries) {
      const { lead, campaign } = delivery;
      if (lead.status !== 'active') {
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', lastError: 'Dado de baja antes del envío' },
        });
        continue;
      }
      const url = `${webUrl}/api/leads/unsubscribe/${lead.unsubscribeToken}`;
      const page = `${webUrl}/baja/${lead.unsubscribeToken}`;
      try {
        await mailer.send({
          to: lead.email,
          subject: campaign.subject,
          ...renderCampaign(campaign.body, page),
          headers: {
            'List-Unsubscribe': `<${url}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: { status: 'sent', sentAt: this.now() },
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await prisma.campaignDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', lastError: message.slice(0, 1000) },
        });
        logger.warn({ deliveryId: delivery.id }, 'Campaign email not sent');
      }
    }
    await prisma.campaign.updateMany({
      where: { status: 'sending', deliveries: { none: { status: 'pending' } } },
      data: { status: 'sent', sentAt: this.now() },
    });
    return sent;
  }

  private toAdmin(row: CampaignRow) {
    return {
      id: row.id,
      subject: row.subject,
      body: row.body,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    };
  }
}
