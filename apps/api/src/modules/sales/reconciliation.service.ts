import {
  nextIsoDate,
  startOfLocalDay,
  toLocalIsoDate,
  type ReconciliationRun,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { Mailer } from '../../integrations/mailer/port.js';
import type { PaymentGateway } from '../../integrations/payment-gateway/port.js';
import { AppError } from '../../lib/errors.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import type { AuditActor } from '../admin/support.js';
import { compareTransaction } from './reconciliation.js';

export interface ReconciliationServiceOptions {
  prisma: PrismaClient;
  gateway: PaymentGateway;
  mailer: Mailer;
  audit: AuditRecorder;
  logger: Pick<Logger, 'warn'>;
  alertEmail?: string;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toRun(run: {
  day: string;
  checked: number;
  discrepancies: number;
  failed: number;
  finishedAt: Date;
}): ReconciliationRun {
  return { ...run, finishedAt: run.finishedAt.toISOString() };
}

/**
 * Conciliación con la pasarela (RF-08): compara las transacciones de un día con su estado real y
 * marca las diferencias. Nunca cambia un pago: la diferencia la resuelve una persona.
 */
export class ReconciliationService {
  private readonly now: () => Date;

  constructor(private readonly options: ReconciliationServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Concilia un día calendario de Punta Arenas; por defecto, ayer. */
  async run(day?: string): Promise<ReconciliationRun> {
    const { prisma, gateway, logger } = this.options;
    const target = day ?? toLocalIsoDate(new Date(this.now().getTime() - DAY_MS));
    const period = { gte: startOfLocalDay(target), lt: startOfLocalDay(nextIsoDate(target)) };
    const payments = await prisma.payment.findMany({
      where: {
        token: { not: null },
        status: { not: 'confirming' },
        OR: [{ createdAt: period }, { confirmedAt: period }],
      },
    });

    let failed = 0;
    let found = 0;
    for (const payment of payments) {
      let details: Awaited<ReturnType<PaymentGateway['getStatus']>>;
      try {
        details = await gateway.getStatus(payment.token ?? '');
      } catch {
        failed += 1;
        logger.warn({ paymentId: payment.id }, 'Payment could not be reconciled');
        continue;
      }
      const kinds = compareTransaction(payment, details);
      const { count } = await prisma.paymentDiscrepancy.createMany({
        data: kinds.map((kind) => ({
          paymentId: payment.id,
          kind,
          localStatus: payment.status,
          gatewayStatus: details.status,
          localAmountClp: payment.amountClp,
          gatewayAmountClp: details.amount,
          day: target,
        })),
        skipDuplicates: true,
      });
      found += count;
    }

    const result = {
      checked: payments.length - failed,
      discrepancies: found,
      failed,
      finishedAt: this.now(),
    };
    const run = await prisma.reconciliationRun.upsert({
      where: { day: target },
      create: { day: target, ...result },
      update: result,
    });
    if (found > 0 || failed > 0) await this.alert(target, found, failed);
    return toRun(run);
  }

  async overview() {
    const { prisma } = this.options;
    const [lastRun, rows] = await Promise.all([
      prisma.reconciliationRun.findFirst({ orderBy: { finishedAt: 'desc' } }),
      prisma.paymentDiscrepancy.findMany({
        where: { resolvedAt: null },
        include: { payment: { select: { buyOrder: true, order: { select: { number: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return {
      lastRun: lastRun ? toRun(lastRun) : null,
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.payment.order.number,
        buyOrder: row.payment.buyOrder,
        kind: row.kind,
        localStatus: row.localStatus,
        gatewayStatus: row.gatewayStatus,
        localAmountClp: row.localAmountClp,
        gatewayAmountClp: row.gatewayAmountClp,
        day: row.day,
      })),
    };
  }

  async resolve(id: string, note: string, actor: AuditActor): Promise<void> {
    const { prisma, audit } = this.options;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentDiscrepancy.updateMany({
        where: { id, resolvedAt: null },
        data: {
          resolvedAt: this.now(),
          resolutionNote: note,
          ...(actor.actorId ? { resolvedById: actor.actorId } : {}),
        },
      });
      if (count === 0) throw AppError.notFound('La diferencia no existe o ya está resuelta.');
      await audit.record(
        {
          ...actor,
          action: 'discrepancy.resolve',
          entityType: 'payment_discrepancy',
          entityId: id,
          after: { note },
        },
        tx,
      );
    });
  }

  private async alert(day: string, found: number, failed: number) {
    const { mailer, logger, alertEmail } = this.options;
    if (!alertEmail) return;
    const text =
      `Conciliación del ${day}: ${found} diferencia(s) nueva(s) y ${failed} transacción(es) ` +
      'que no se pudieron consultar. Revísalas en el panel, sección Conciliación.';
    try {
      await mailer.send({
        to: alertEmail,
        subject: `Conciliación del ${day}: revisar`,
        text,
        html: `<p>${text}</p>`,
      });
    } catch {
      logger.warn({ day }, 'Reconciliation alert not sent');
    }
  }
}
