-- Fase 7 (ventas, documentos, reportes y difusión).

-- CreateEnum
CREATE TYPE "DiscrepancyKind" AS ENUM ('status_mismatch', 'amount_mismatch');

-- AlterTable
ALTER TABLE "sales_documents" ADD COLUMN "external_id" VARCHAR(100);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "day" VARCHAR(10) NOT NULL,
    "checked" INTEGER NOT NULL,
    "discrepancies" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "finished_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "payment_discrepancies" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "kind" "DiscrepancyKind" NOT NULL,
    "local_status" VARCHAR(30) NOT NULL,
    "gateway_status" VARCHAR(30) NOT NULL,
    "local_amount_clp" INTEGER NOT NULL,
    "gateway_amount_clp" INTEGER NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolution_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_page_views" (
    "day" VARCHAR(10) NOT NULL,
    "course_id" UUID NOT NULL,
    "utm_source" VARCHAR(100) NOT NULL DEFAULT '',
    "utm_medium" VARCHAR(100) NOT NULL DEFAULT '',
    "utm_campaign" VARCHAR(150) NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_page_views_pkey" PRIMARY KEY ("day","course_id","utm_source","utm_medium","utm_campaign")
);

-- CreateIndex
CREATE INDEX "payment_discrepancies_resolved_at_idx" ON "payment_discrepancies"("resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_discrepancies_payment_id_kind_key" ON "payment_discrepancies"("payment_id", "kind");

-- CreateIndex
CREATE INDEX "course_page_views_course_id_idx" ON "course_page_views"("course_id");

-- AddForeignKey
ALTER TABLE "payment_discrepancies" ADD CONSTRAINT "payment_discrepancies_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_discrepancies" ADD CONSTRAINT "payment_discrepancies_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_page_views" ADD CONSTRAINT "course_page_views_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
