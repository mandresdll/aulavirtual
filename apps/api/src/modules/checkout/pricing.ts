import { formatClp, percentageOf, type CouponScope, type CouponType } from '@plataforma/shared';

/** Ítem que se cotiza: precio de la edición (IVA incluido si es afecta). */
export interface PricedItem {
  editionId: string;
  courseId: string;
  unitPriceClp: number;
}

export interface CouponRules {
  code: string;
  type: CouponType;
  value: number;
  scope: CouponScope;
  courseId: string | null;
  editionId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  usesCount: number;
  active: boolean;
}

export interface CouponUsage {
  /** Usos vigentes del cupón por este usuario (órdenes no anuladas ni rechazadas). */
  userUses: number;
}

export type CouponCheck = { ok: true } | { ok: false; reason: string };

/** Reglas del cupón que no dependen de los ítems: vigencia, estado y límites de uso. */
export function checkCoupon(coupon: CouponRules, usage: CouponUsage, now: Date): CouponCheck {
  if (!coupon.active) return { ok: false, reason: 'El cupón no está activo.' };
  if (coupon.validFrom && now < coupon.validFrom) {
    return { ok: false, reason: 'El cupón aún no está vigente.' };
  }
  if (coupon.validUntil && now >= coupon.validUntil) {
    return { ok: false, reason: 'El cupón está vencido.' };
  }
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) {
    return { ok: false, reason: 'El cupón ya alcanzó su límite de usos.' };
  }
  if (coupon.maxUsesPerUser !== null && usage.userUses >= coupon.maxUsesPerUser) {
    return { ok: false, reason: 'Ya usaste este cupón el máximo de veces permitido.' };
  }
  return { ok: true };
}

export function appliesTo(coupon: CouponRules, item: PricedItem): boolean {
  switch (coupon.scope) {
    case 'all':
      return true;
    case 'course':
      return coupon.courseId === item.courseId;
    case 'edition':
      return coupon.editionId === item.editionId;
  }
}

export interface PricedLine extends PricedItem {
  discountClp: number;
  totalClp: number;
}

/**
 * Descuento por ítem en CLP enteros (regla 8):
 * - Porcentaje: sobre cada ítem del alcance, redondeado hacia abajo (`percentageOf`), así el
 *   descuento nunca supera el porcentaje declarado.
 * - Monto fijo: se descuenta una vez por orden, repartido en los ítems del alcance en orden y
 *   sin dejar ninguno bajo $0.
 */
export function priceLines(items: readonly PricedItem[], coupon: CouponRules | null): PricedLine[] {
  let remainingFixed = coupon?.type === 'fixed_amount' ? coupon.value : 0;
  return items.map((item) => {
    let discountClp = 0;
    if (coupon && appliesTo(coupon, item)) {
      if (coupon.type === 'percentage') {
        discountClp = percentageOf(item.unitPriceClp, coupon.value);
      } else {
        discountClp = Math.min(remainingFixed, item.unitPriceClp);
        remainingFixed -= discountClp;
      }
    }
    return { ...item, discountClp, totalClp: item.unitPriceClp - discountClp };
  });
}

export function totals(lines: readonly PricedLine[]) {
  const subtotalClp = lines.reduce((sum, line) => sum + line.unitPriceClp, 0);
  const discountClp = lines.reduce((sum, line) => sum + line.discountClp, 0);
  return { subtotalClp, discountClp, totalClp: subtotalClp - discountClp };
}

/** Texto para el comprador: «10 % de descuento» o «$5.000 de descuento». */
export function describeCoupon(coupon: Pick<CouponRules, 'type' | 'value'>): string {
  return coupon.type === 'percentage'
    ? `${coupon.value} % de descuento`
    : `${formatClp(coupon.value)} de descuento`;
}
