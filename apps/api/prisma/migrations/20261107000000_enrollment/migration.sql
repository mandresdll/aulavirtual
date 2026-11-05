-- Fase 5 (matrícula): correo de bienvenida y desmatrícula pendientes para el worker.

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN "lms_unenrolled_at" TIMESTAMPTZ(3),
ADD COLUMN "welcome_sent_at" TIMESTAMPTZ(3);
