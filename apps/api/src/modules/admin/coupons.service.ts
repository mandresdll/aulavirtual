import type { AdminCoupon, CouponInput } from '@plataforma/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { changedFields } from '../../plugins/audit.js';
import type { AdminServiceDeps } from './areas.service.js';
import { mapPrismaError, type AuditActor } from './support.js';

const COUPON_NOT_FOUND = 'El cupón no existe.';
const DUPLICATE_CODE = 'Ya existe un cupón con ese código.';

const couponInclude = {
  course: { select: { title: true } },
  edition: { select: { code: true, course: { select: { title: true } } } },
} satisfies Prisma.CouponInclude;
type CouponRow = Prisma.CouponGetPayload<{ include: typeof couponInclude }>;

const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

function couponFields(coupon: Omit<CouponRow, 'course' | 'edition'>) {
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    scope: coupon.scope,
    courseId: coupon.courseId,
    editionId: coupon.editionId,
    validFrom: isoOrNull(coupon.validFrom),
    validUntil: isoOrNull(coupon.validUntil),
    maxUses: coupon.maxUses,
    maxUsesPerUser: coupon.maxUsesPerUser,
    reason: coupon.reason,
    active: coupon.active,
  };
}

function toAdmin(coupon: CouponRow): AdminCoupon {
  const scopeLabel = coupon.edition
    ? `${coupon.edition.course.title} (${coupon.edition.code})`
    : (coupon.course?.title ?? null);
  return {
    ...couponFields(coupon),
    id: coupon.id,
    scopeLabel,
    usesCount: coupon.usesCount,
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

/** Datos para la BD: el alcance define qué referencia se guarda (las demás quedan en `null`). */
function couponData(input: CouponInput) {
  return {
    ...input,
    courseId: input.scope === 'course' ? input.courseId : null,
    editionId: input.scope === 'edition' ? input.editionId : null,
    validFrom: input.validFrom ? new Date(input.validFrom) : null,
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
  };
}

async function assertScope(tx: Prisma.TransactionClient, input: CouponInput): Promise<void> {
  if (input.scope === 'course' && input.courseId) {
    const found = await tx.course.count({ where: { id: input.courseId } });
    if (!found) throw new AppError(400, 'INVALID_COURSE', 'El curso seleccionado no existe.');
  }
  if (input.scope === 'edition' && input.editionId) {
    const found = await tx.courseEdition.count({ where: { id: input.editionId } });
    if (!found) throw new AppError(400, 'INVALID_EDITION', 'La edición seleccionada no existe.');
  }
}

/**
 * Cupones (RF-04). No se eliminan (pueden estar en órdenes): se desactivan. Cada cambio queda
 * en la auditoría con su diff (valor, vigencia, límites…).
 */
export class AdminCouponsService {
  constructor(private readonly deps: AdminServiceDeps) {}

  async list(): Promise<AdminCoupon[]> {
    const coupons = await this.deps.prisma.coupon.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: couponInclude,
    });
    return coupons.map(toAdmin);
  }

  async create(input: CouponInput, actor: AuditActor): Promise<AdminCoupon> {
    return this.deps.prisma
      .$transaction(async (tx) => {
        await assertScope(tx, input);
        const created = await tx.coupon.create({ data: couponData(input), include: couponInclude });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'coupon.create',
            entityType: 'coupon',
            entityId: created.id,
            after: couponFields(created),
          },
          tx,
        );
        return toAdmin(created);
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_CODE }));
  }

  async update(id: string, input: CouponInput, actor: AuditActor): Promise<AdminCoupon> {
    return this.deps.prisma
      .$transaction(async (tx) => {
        const before = await tx.coupon.findUnique({ where: { id } });
        if (!before) throw AppError.notFound(COUPON_NOT_FOUND);
        await assertScope(tx, input);
        const updated = await tx.coupon.update({
          where: { id },
          data: couponData(input),
          include: couponInclude,
        });
        await this.deps.audit.record(
          {
            ...actor,
            action: 'coupon.update',
            entityType: 'coupon',
            entityId: id,
            ...changedFields(couponFields(before), couponFields(updated)),
          },
          tx,
        );
        return toAdmin(updated);
      })
      .catch((error: unknown) => mapPrismaError(error, { unique: DUPLICATE_CODE }));
  }
}
