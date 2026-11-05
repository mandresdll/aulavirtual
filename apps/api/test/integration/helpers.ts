import type { PrismaClient } from '@prisma/client';
import { parseEnv } from '../../src/config/env.js';

/** Configuración de las pruebas de integración (BD y Redis reales). */
export function integrationEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    APP_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    REDIS_URL: process.env.TEST_REDIS_URL,
    MAILER_DRIVER: 'memory',
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
}

/**
 * Deja el catálogo vacío entre archivos de prueba. Las órdenes, pagos y auditoría no se
 * pueden borrar (triggers), así que se conservan los usuarios que tengan órdenes.
 */
export async function resetCatalogData(prisma: PrismaClient): Promise<void> {
  await prisma.seatReservation.deleteMany({ where: { orderId: null } });
  await prisma.waitlistEntry.deleteMany();
  await prisma.certificate.deleteMany({ where: { enrollment: { orderItemId: null } } });
  await prisma.enrollment.deleteMany({ where: { orderItemId: null } });
  await prisma.cartItem.deleteMany();
  await prisma.coupon.deleteMany({ where: { orders: { none: {} }, redemptions: { none: {} } } });
  await prisma.courseInstructor.deleteMany();
  await prisma.courseEdition.deleteMany({ where: { orderItems: { none: {} } } });
  await prisma.lead.deleteMany();
  await prisma.course.deleteMany({ where: { editions: { none: {} } } });
  await prisma.instructor.deleteMany({ where: { courses: { none: {} } } });
  await prisma.area.deleteMany({ where: { courses: { none: {} } } });
  await prisma.user.deleteMany({ where: { orders: { none: {} }, enrollments: { none: {} } } });
}

const DAY = 24 * 60 * 60 * 1000;

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}
