import {
  nextIsoDate,
  ORDER_STATUS_LABELS,
  SALES_DOCUMENT_STATUS_LABELS,
  SALES_DOCUMENT_TYPE_LABELS,
  startOfLocalDay,
  toLocalIsoDate,
  type Sale,
  type SalesExportQuery,
  type SalesQuery,
} from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Table } from '../../lib/tabular.js';
import { paginate } from '../admin/support.js';

const EXPORT_LIMIT = 20_000;

const saleInclude = {
  user: { select: { name: true, email: true } },
  items: { select: { courseTitle: true } },
  refunds: { where: { status: 'completed' }, select: { amountClp: true } },
  salesDocument: { select: { status: true, externalFolio: true } },
} satisfies Prisma.OrderInclude;

type SaleRow = Prisma.OrderGetPayload<{ include: typeof saleInclude }>;

function toSale(order: SaleRow): Sale {
  return {
    number: order.number,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    buyerName: order.user.name,
    buyerEmail: order.user.email,
    courses: order.items.map((item) => item.courseTitle),
    discountClp: order.discountClp,
    totalClp: order.totalClp,
    refundedClp: order.refunds.reduce((sum, refund) => sum + refund.amountClp, 0),
    documentType: order.documentType,
    documentStatus: order.salesDocument?.status ?? null,
    folio: order.salesDocument?.externalFolio ?? null,
    utmCampaign: order.utmCampaign,
  };
}

function salesWhere(
  query: Pick<SalesQuery, 'from' | 'to' | 'status' | 'q' | 'courseId'>,
): Prisma.OrderWhereInput {
  const contains = query.q ? { contains: query.q, mode: 'insensitive' as const } : null;
  return {
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: startOfLocalDay(query.from) } : {}),
            ...(query.to ? { lt: startOfLocalDay(nextIsoDate(query.to)) } : {}),
          },
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.courseId ? { items: { some: { edition: { courseId: query.courseId } } } } : {}),
    ...(contains
      ? {
          OR: [{ number: contains }, { user: { email: contains } }, { user: { name: contains } }],
        }
      : {}),
  };
}

/** Listado de ventas con filtros y su descarga (RF-08). */
export class SalesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: SalesQuery) {
    const where = salesWhere(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toSale), ...paginate(query.page, query.pageSize, total) };
  }

  async table(query: SalesExportQuery): Promise<Table> {
    const rows = await this.prisma.order.findMany({
      where: salesWhere(query),
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    return {
      name: 'ventas',
      headers: [
        'Orden',
        'Fecha',
        'Fecha de pago',
        'Estado',
        'Comprador',
        'Correo',
        'Cursos',
        'Descuento',
        'Total',
        'Devuelto',
        'Documento',
        'Estado del documento',
        'Folio',
        'Campaña',
      ],
      rows: rows
        .map(toSale)
        .map((sale) => [
          sale.number,
          toLocalIsoDate(new Date(sale.createdAt)),
          sale.paidAt ? toLocalIsoDate(new Date(sale.paidAt)) : null,
          ORDER_STATUS_LABELS[sale.status],
          sale.buyerName,
          sale.buyerEmail,
          sale.courses.join(', '),
          sale.discountClp,
          sale.totalClp,
          sale.refundedClp,
          SALES_DOCUMENT_TYPE_LABELS[sale.documentType],
          sale.documentStatus ? SALES_DOCUMENT_STATUS_LABELS[sale.documentStatus] : null,
          sale.folio,
          sale.utmCampaign,
        ]),
    };
  }
}
