-- Fase 4 (pagos): estado de confirmación en curso y correo del comprobante pendiente.

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'confirming' AFTER 'created';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "receipt_sent_at" TIMESTAMPTZ(3);
