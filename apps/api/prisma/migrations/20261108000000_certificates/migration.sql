-- Fase 6 (certificados): correo del certificado pendiente para el worker.

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN "email_sent_at" TIMESTAMPTZ(3);
