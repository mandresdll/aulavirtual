import {
  nextIsoDate,
  REPORT_GROUP_LABELS,
  startOfLocalDay,
  type ConversionRow,
  type Report,
  type ReportExportQuery,
  type ReportQuery,
  type ReportRow,
} from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Table } from '../../lib/tabular.js';
import {
  aggregateReport,
  allocate,
  ConversionFunnel,
  type FactScope,
  type ReportFacts,
  type SaleFact,
} from './aggregate.js';

const SOLD = ['paid', 'partially_refunded', 'refunded', 'refund_requested'] as const;

const editionScope = {
  select: { id: true, code: true, course: { select: { id: true, title: true } } },
} satisfies Prisma.CourseEditionDefaultArgs;

type EditionScope = Prisma.CourseEditionGetPayload<typeof editionScope>;

function scope(edition: EditionScope, date: Date): FactScope {
  return {
    courseId: edition.course.id,
    courseTitle: edition.course.title,
    editionId: edition.id,
    editionCode: edition.code,
    date,
  };
}

/**
 * Reportes (RF-09), calculados al consultar. Un monto cuenta en el período en que se pagó la orden,
 * incluidas sus devoluciones posteriores, de modo que cada venta se ve con su resultado final.
 * Inscripciones por fecha de creación y certificados por fecha de emisión, sin contar reemisiones.
 */
export class ReportsService {
  constructor(private readonly prisma: PrismaClient) {}

  async build(query: ReportQuery): Promise<Report> {
    const period = this.period(query);
    const [facts, conversion] = await Promise.all([
      this.facts(query, period),
      this.conversion(query, period),
    ]);
    return { ...aggregateReport(facts, query.groupBy), conversion };
  }

  async table(query: ReportExportQuery): Promise<Table> {
    const report = await this.build(query);
    const name = `${query.table === 'conversion' ? 'conversion' : 'reporte'}-${query.from}-${query.to}`;
    return query.table === 'conversion'
      ? conversionTable(name, report.conversion)
      : summaryTable(name, query.groupBy, report.rows);
  }

  private period(query: ReportQuery) {
    return { gte: startOfLocalDay(query.from), lt: startOfLocalDay(nextIsoDate(query.to)) };
  }

  private editionFilter(query: ReportQuery): Prisma.CourseEditionWhereInput {
    return {
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.editionId ? { id: query.editionId } : {}),
    };
  }

  private async facts(query: ReportQuery, period: Prisma.DateTimeFilter): Promise<ReportFacts> {
    const edition = this.editionFilter(query);
    const [orders, enrollments, certificates] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          status: { in: [...SOLD] },
          paidAt: period,
          items: { some: { edition } },
        },
        select: {
          id: true,
          paidAt: true,
          items: {
            select: {
              unitPriceClp: true,
              discountClp: true,
              totalClp: true,
              edition: editionScope,
            },
          },
          refunds: { where: { status: 'completed' }, select: { amountClp: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { createdAt: period, status: { not: 'withdrawn' }, edition },
        select: { source: true, status: true, createdAt: true, edition: editionScope },
      }),
      this.prisma.certificate.findMany({
        where: {
          issuedAt: period,
          previousCertificateId: null,
          enrollment: { edition },
        },
        select: { issuedAt: true, enrollment: { select: { edition: editionScope } } },
      }),
    ]);

    const inScope = (item: EditionScope) =>
      (!query.courseId || item.course.id === query.courseId) &&
      (!query.editionId || item.id === query.editionId);

    const sales = orders.flatMap((order): SaleFact[] => {
      const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountClp, 0);
      const shares = allocate(
        refunded,
        order.items.map((item) => item.totalClp),
      );
      return order.items.flatMap((item, index) =>
        inScope(item.edition)
          ? [
              {
                ...scope(item.edition, order.paidAt ?? (period.gte as Date)),
                orderId: order.id,
                grossClp: item.unitPriceClp,
                discountClp: item.discountClp,
                refundsClp: shares[index] ?? 0,
              },
            ]
          : [],
      );
    });

    return {
      sales,
      enrollments: enrollments.map((row) => ({
        ...scope(row.edition, row.createdAt),
        paid: row.source === 'purchase',
        status: row.status,
      })),
      certificates: certificates.map((row) => scope(row.enrollment.edition, row.issuedAt)),
    };
  }

  /** Embudo por UTM. Las visitas y los interesados son por curso: no conocen la edición. */
  private async conversion(
    query: ReportQuery,
    period: Prisma.DateTimeFilter,
  ): Promise<ConversionRow[]> {
    const { prisma } = this;
    const edition = this.editionFilter(query);
    const courseId =
      query.courseId ??
      (query.editionId
        ? (
            await prisma.courseEdition.findUnique({
              where: { id: query.editionId },
              select: { courseId: true },
            })
          )?.courseId
        : undefined);
    const course = courseId ? { courseId } : {};
    const utm = { utmSource: true, utmMedium: true, utmCampaign: true } as const;

    const [views, leads, orders] = await Promise.all([
      prisma.coursePageView.groupBy({
        by: ['utmSource', 'utmMedium', 'utmCampaign'],
        where: { day: { gte: query.from, lte: query.to }, ...course },
        _sum: { views: true },
      }),
      prisma.lead.findMany({ where: { createdAt: period, ...course }, select: utm }),
      prisma.order.findMany({
        where: {
          createdAt: period,
          ...(courseId || query.editionId ? { items: { some: { edition } } } : {}),
        },
        select: { ...utm, status: true },
      }),
    ]);

    const touch = (row: {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
    }) => ({ source: row.utmSource, medium: row.utmMedium, campaign: row.utmCampaign });

    const funnel = new ConversionFunnel();
    for (const row of views) funnel.add('views', touch(row), row._sum.views ?? 0);
    for (const row of leads) funnel.add('leads', touch(row));
    for (const row of orders) {
      funnel.add('orders', touch(row));
      if ((SOLD as readonly string[]).includes(row.status)) funnel.add('paid', touch(row));
    }
    return funnel.toRows();
  }
}

function summaryTable(name: string, groupBy: ReportQuery['groupBy'], rows: ReportRow[]): Table {
  return {
    name,
    headers: [
      REPORT_GROUP_LABELS[groupBy],
      'Órdenes',
      'Brutos',
      'Descuentos',
      'Devoluciones',
      'Netos',
      'Inscritos pagados',
      'Inscritos liberados',
      'Aprobados',
      'Reprobados',
      'Certificados',
    ],
    rows: rows.map((row) => [
      row.label,
      row.orders,
      row.grossClp,
      row.discountClp,
      row.refundsClp,
      row.netClp,
      row.paidEnrollments,
      row.freeEnrollments,
      row.completed,
      row.failedCourse,
      row.certificates,
    ]),
  };
}

function conversionTable(name: string, rows: ConversionRow[]): Table {
  return {
    name,
    headers: ['Fuente', 'Medio', 'Campaña', 'Visitas', 'Interesados', 'Órdenes', 'Pagos'],
    rows: rows.map((row) => [
      row.source || '(directo)',
      row.medium,
      row.campaign,
      row.views,
      row.leads,
      row.orders,
      row.paid,
    ]),
  };
}
