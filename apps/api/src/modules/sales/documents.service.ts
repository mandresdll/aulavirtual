import {
  nextIsoDate,
  startOfLocalDay,
  type AdminDocument,
  type DocumentExport,
  type DocumentsQuery,
  type RegisterFolio,
} from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { IntegrationError } from '../../integrations/errors.js';
import type {
  InvoicingGateway,
  SalesDocumentInput,
  SalesDocumentResult,
} from '../../integrations/invoicing/port.js';
import { AppError } from '../../lib/errors.js';
import type { Table } from '../../lib/tabular.js';
import type { AuditRecorder } from '../../plugins/audit.js';
import { paginate, type AuditActor } from '../admin/support.js';
import { documentsTable, type DocumentColumn, type DocumentRecord } from './document-table.js';

export interface DocumentsServiceOptions {
  prisma: PrismaClient;
  gateway: InvoicingGateway;
  audit: AuditRecorder;
  logger: Pick<Logger, 'warn'>;
  columns: readonly DocumentColumn[];
  vatPercent: number;
  now?: () => Date;
}

const SWEEP_BATCH = 50;
const EXPORT_LIMIT = 20_000;
const NOT_FOUND = 'El documento no existe.';

/** Solo llevan documento las órdenes con un monto pagado: una orden de $0 no se emite. */
const billable = {
  totalClp: { gt: 0 },
  status: { in: ['paid', 'partially_refunded', 'refunded', 'refund_requested'] },
} satisfies Prisma.OrderWhereInput;

const documentInclude = {
  order: {
    include: {
      user: { select: { name: true, email: true } },
      items: { select: { courseTitle: true, totalClp: true, taxTreatment: true } },
      refunds: { where: { status: 'completed' }, select: { amountClp: true } },
    },
  },
} satisfies Prisma.SalesDocumentInclude;

type DocumentRow = Prisma.SalesDocumentGetPayload<{ include: typeof documentInclude }>;

const refunded = (row: DocumentRow) =>
  row.order.refunds.reduce((sum, refund) => sum + refund.amountClp, 0);

function toAdmin(row: DocumentRow): AdminDocument {
  return {
    id: row.id,
    orderNumber: row.order.number,
    type: row.type,
    status: row.status,
    receiverName: row.receiverName ?? row.order.user.name,
    totalClp: row.order.totalClp,
    refundedClp: refunded(row),
    paidAt: row.order.paidAt?.toISOString() ?? null,
    folio: row.externalFolio,
    exportedAt: row.exportedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

function toRecord(row: DocumentRow): DocumentRecord {
  return {
    folio: row.externalFolio,
    type: row.type,
    status: row.status,
    paidAt: row.order.paidAt,
    orderNumber: row.order.number,
    receiverRut: row.receiverRut,
    receiverName: row.receiverName ?? row.order.user.name,
    receiverActivity: row.receiverActivity,
    receiverAddress: row.receiverAddress,
    receiverEmail: row.order.user.email,
    lines: row.order.items,
    refundedClp: refunded(row),
  };
}

/** El documento tal como lo recibe el sistema de emisión. */
export function toGatewayInput(row: DocumentRow, issuedAt: Date): SalesDocumentInput {
  return {
    orderId: row.orderId,
    type: row.type === 'invoice' ? 'factura' : 'boleta',
    issuedAt: row.order.paidAt ?? issuedAt,
    totalAmount: row.order.totalClp,
    receiver: {
      name: row.receiverName ?? row.order.user.name,
      email: row.order.user.email,
      ...(row.receiverRut ? { rut: row.receiverRut } : {}),
      ...(row.receiverActivity ? { businessActivity: row.receiverActivity } : {}),
      ...(row.receiverAddress ? { address: row.receiverAddress } : {}),
    },
    lines: row.order.items.map((item) => ({
      description: item.courseTitle,
      quantity: 1,
      unitAmount: item.totalClp,
      taxTreatment: item.taxTreatment === 'taxed' ? 'affected' : 'exempt',
    })),
  };
}

function stateFrom(result: SalesDocumentResult) {
  return {
    status: result.status === 'rejected' ? ('failed' as const) : result.status,
    ...(result.externalId ? { externalId: result.externalId } : {}),
    ...(result.folio ? { externalFolio: result.folio } : {}),
    lastError: result.status === 'rejected' ? 'El sistema de emisión rechazó el documento' : null,
  };
}

/**
 * Boletas y facturas (RF-08). Con un sistema conectado, el worker envía cada documento y guarda el
 * folio. Sin él (`export`), salen en el archivo contable y el folio se registra en el panel.
 * Una devolución no anula el documento: la nota de crédito se gestiona en el sistema de emisión.
 */
export class DocumentsService {
  private readonly now: () => Date;

  constructor(private readonly options: DocumentsServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(query: DocumentsQuery) {
    const { prisma, gateway } = this.options;
    const where: Prisma.SalesDocumentWhereInput = {
      order: { ...billable, ...paidBetween(query.from, query.to) },
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.salesDocument.count({ where }),
      prisma.salesDocument.findMany({
        where,
        include: documentInclude,
        orderBy: { order: { paidAt: 'desc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(toAdmin),
      ...paginate(query.page, query.pageSize, total),
      deliveredByFile: gateway.deliversByFile,
    };
  }

  /** Genera el archivo contable del período y deja constancia de la exportación. */
  async exportFile(input: DocumentExport, actor: AuditActor): Promise<Table> {
    const { prisma, gateway, audit, columns, vatPercent } = this.options;
    const rows = await prisma.salesDocument.findMany({
      where: { order: { ...billable, ...paidBetween(input.from, input.to) } },
      include: documentInclude,
      orderBy: { order: { paidAt: 'asc' } },
      take: EXPORT_LIMIT,
    });
    const now = this.now();
    await prisma.$transaction(async (tx) => {
      const ids = rows.map((row) => row.id);
      await tx.salesDocument.updateMany({ where: { id: { in: ids } }, data: { exportedAt: now } });
      if (gateway.deliversByFile) {
        await tx.salesDocument.updateMany({
          where: { id: { in: ids }, status: 'pending' },
          data: { status: 'exported' },
        });
      }
      await audit.record(
        {
          ...actor,
          action: 'documents.export',
          entityType: 'sales_document',
          entityId: null,
          after: { from: input.from, to: input.to, format: input.format, count: rows.length },
        },
        tx,
      );
    });
    return documentsTable(rows.map(toRecord), columns, vatPercent);
  }

  /** Registra el folio que entregó el sistema de emisión (flujo por archivo). */
  async registerFolio(id: string, input: RegisterFolio, actor: AuditActor): Promise<AdminDocument> {
    const { prisma, audit } = this.options;
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.salesDocument.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound(NOT_FOUND);
      const updated = await tx.salesDocument.update({
        where: { id },
        data: { externalFolio: input.folio, status: 'issued', lastError: null },
        include: documentInclude,
      });
      await audit.record(
        {
          ...actor,
          action: 'document.folio',
          entityType: 'sales_document',
          entityId: id,
          before: { folio: existing.externalFolio, status: existing.status },
          after: { folio: input.folio, status: 'issued' },
        },
        tx,
      );
      return updated;
    });
    return toAdmin(row);
  }

  /** Devuelve a pendiente un documento rechazado para que el worker lo reintente. */
  async retry(id: string, actor: AuditActor): Promise<AdminDocument> {
    const { prisma, audit } = this.options;
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.salesDocument.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound(NOT_FOUND);
      if (existing.status !== 'failed') {
        throw AppError.conflict('DOCUMENT_NOT_FAILED', 'Este documento no tiene un error.');
      }
      const updated = await tx.salesDocument.update({
        where: { id },
        data: { status: 'pending', lastError: null },
        include: documentInclude,
      });
      await audit.record(
        { ...actor, action: 'document.retry', entityType: 'sales_document', entityId: id },
        tx,
      );
      return updated;
    });
    return toAdmin(row);
  }

  /** Envía los pendientes y consulta los ya recibidos. Sin efecto en el flujo por archivo. */
  async submitPending(): Promise<number> {
    const { prisma, gateway, logger } = this.options;
    if (gateway.deliversByFile) return 0;
    const pending = await prisma.salesDocument.findMany({
      where: { status: 'pending', order: billable },
      include: documentInclude,
      take: SWEEP_BATCH,
    });
    let processed = 0;
    for (const row of pending) {
      try {
        const result = row.externalId
          ? await gateway.getStatus(row.externalId)
          : await gateway.submit(toGatewayInput(row, this.now()));
        await prisma.salesDocument.update({ where: { id: row.id }, data: stateFrom(result) });
        processed += 1;
      } catch (error) {
        const definitive = error instanceof IntegrationError && !error.retryable;
        const message = error instanceof Error ? error.message : 'Unknown error';
        await prisma.salesDocument.update({
          where: { id: row.id },
          data: { lastError: message.slice(0, 1000), ...(definitive ? { status: 'failed' } : {}) },
        });
        logger.warn({ documentId: row.id, definitive }, 'Sales document not delivered');
      }
    }
    return processed;
  }
}

function paidBetween(from?: string, to?: string): Prisma.OrderWhereInput {
  if (!from && !to) return {};
  return {
    paidAt: {
      ...(from ? { gte: startOfLocalDay(from) } : {}),
      ...(to ? { lt: startOfLocalDay(nextIsoDate(to)) } : {}),
    },
  };
}
