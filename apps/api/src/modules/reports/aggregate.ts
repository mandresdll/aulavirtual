import {
  toLocalIsoDate,
  type ConversionRow,
  type ReportGroup,
  type ReportMetrics,
  type ReportRow,
} from '@plataforma/shared';

/** Dónde cae un hecho: curso, edición y fecha. */
export interface FactScope {
  courseId: string;
  courseTitle: string;
  editionId: string;
  editionCode: string;
  date: Date;
}

export interface SaleFact extends FactScope {
  orderId: string;
  grossClp: number;
  discountClp: number;
  refundsClp: number;
}

export interface EnrollmentFact extends FactScope {
  /** `purchase`: pagada. El resto es liberada (comunidad CFT, beca del 100 % o manual). */
  paid: boolean;
  status: string;
}

export type CertificateFact = FactScope;

export interface ReportFacts {
  sales: SaleFact[];
  enrollments: EnrollmentFact[];
  certificates: CertificateFact[];
}

/**
 * Reparte un monto entero entre partes proporcionales a sus pesos, sin perder pesos por redondeo
 * (método del mayor resto). Una devolución se reparte así entre los cursos de la orden.
 */
export function allocate(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return weights.map((_, index) => (index === 0 ? amount : 0));
  const exact = weights.map((weight) => (amount * weight) / total);
  const shares = exact.map(Math.floor);
  let left = amount - shares.reduce((sum, share) => sum + share, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (left === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

function groupOf(scope: FactScope, groupBy: ReportGroup): { key: string; label: string } {
  if (groupBy === 'edition') {
    return { key: scope.editionId, label: `${scope.courseTitle} (${scope.editionCode})` };
  }
  if (groupBy === 'month') {
    const month = toLocalIsoDate(scope.date).slice(0, 7);
    return { key: month, label: month };
  }
  return { key: scope.courseId, label: scope.courseTitle };
}

const emptyMetrics = (): ReportMetrics => ({
  orders: 0,
  grossClp: 0,
  discountClp: 0,
  refundsClp: 0,
  netClp: 0,
  paidEnrollments: 0,
  freeEnrollments: 0,
  completed: 0,
  failedCourse: 0,
  certificates: 0,
});

function addEnrollment(metrics: ReportMetrics, fact: EnrollmentFact) {
  if (fact.paid) metrics.paidEnrollments += 1;
  else metrics.freeEnrollments += 1;
  if (fact.status === 'completed') metrics.completed += 1;
  if (fact.status === 'failed_course') metrics.failedCourse += 1;
}

function addSale(metrics: ReportMetrics, fact: SaleFact) {
  metrics.grossClp += fact.grossClp;
  metrics.discountClp += fact.discountClp;
  metrics.refundsClp += fact.refundsClp;
  metrics.netClp += fact.grossClp - fact.discountClp - fact.refundsClp;
}

/** Suma los hechos del período por curso, edición o mes, además del total. */
export function aggregateReport(
  facts: ReportFacts,
  groupBy: ReportGroup,
): { totals: ReportMetrics; rows: ReportRow[] } {
  const rows = new Map<string, ReportRow & { orderIds: Set<string> }>();
  const rowFor = (scope: FactScope) => {
    const { key, label } = groupOf(scope, groupBy);
    let row = rows.get(key);
    if (!row) {
      row = { key, label, ...emptyMetrics(), orderIds: new Set() };
      rows.set(key, row);
    }
    return row;
  };

  const totals = emptyMetrics();
  const orderIds = new Set<string>();
  for (const fact of facts.sales) {
    const row = rowFor(fact);
    addSale(row, fact);
    addSale(totals, fact);
    row.orderIds.add(fact.orderId);
    orderIds.add(fact.orderId);
  }
  for (const fact of facts.enrollments) {
    addEnrollment(rowFor(fact), fact);
    addEnrollment(totals, fact);
  }
  for (const fact of facts.certificates) {
    rowFor(fact).certificates += 1;
    totals.certificates += 1;
  }
  totals.orders = orderIds.size;

  const sorted = [...rows.values()]
    .map(({ orderIds: ids, ...row }) => ({ ...row, orders: ids.size }))
    .sort((a, b) =>
      groupBy === 'month'
        ? a.key.localeCompare(b.key)
        : b.netClp - a.netClp || a.label.localeCompare(b.label),
    );
  return { totals, rows: sorted };
}

export interface UtmTouch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

type ConversionStep = 'views' | 'leads' | 'orders' | 'paid';

/** Embudo por campaña: acumula visitas, interesados, órdenes y pagos con la misma UTM. */
export class ConversionFunnel {
  private readonly rows = new Map<string, ConversionRow>();

  add(step: ConversionStep, touch: UtmTouch, amount = 1) {
    const source = touch.source ?? '';
    const medium = touch.medium ?? '';
    const campaign = touch.campaign ?? '';
    const key = JSON.stringify([source, medium, campaign]);
    const row = this.rows.get(key) ?? {
      source,
      medium,
      campaign,
      views: 0,
      leads: 0,
      orders: 0,
      paid: 0,
    };
    row[step] += amount;
    this.rows.set(key, row);
  }

  toRows(): ConversionRow[] {
    return [...this.rows.values()].sort((a, b) => b.paid - a.paid || b.views - a.views);
  }
}
