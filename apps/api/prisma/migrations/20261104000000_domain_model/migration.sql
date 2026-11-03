-- Fase 1: modelo de dominio completo (sección 4 de la especificación).
-- Generado con `prisma migrate diff`; al final, SQL que Prisma no expresa.

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('online', 'in_person', 'blended');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('draft', 'published', 'closed', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('taxed', 'exempt');

-- CreateEnum
CREATE TYPE "PassingCriterion" AS ENUM ('completion', 'grade');

-- CreateEnum
CREATE TYPE "CommunityProfile" AS ENUM ('student', 'teacher', 'staff');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'awaiting_payment', 'paid', 'failed', 'cancelled', 'refund_requested', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'authorized', 'rejected', 'aborted', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('requested', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('purchase', 'free_institutional', 'coupon_100', 'manual_admin');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('pending_lms', 'enrolled', 'failed', 'completed', 'failed_course', 'withdrawn');

-- CreateEnum
CREATE TYPE "SeatReservationStatus" AS ENUM ('active', 'consumed', 'released', 'expired');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'notified', 'converted', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percentage', 'fixed_amount');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('all', 'course', 'edition');

-- CreateEnum
CREATE TYPE "CouponReason" AS ENUM ('scholarship', 'agreement', 'presale', 'promotion', 'other');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('valid', 'revoked', 'reissued');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "SalesDocumentType" AS ENUM ('receipt', 'invoice');

-- CreateEnum
CREATE TYPE "SalesDocumentStatus" AS ENUM ('pending', 'exported', 'issued', 'failed');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('active', 'unsubscribed');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('terms', 'privacy', 'withdrawal', 'refunds');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "sga_user_id" VARCHAR(100),
    "idp_subject" VARCHAR(255),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "rut" VARCHAR(12),
    "phone" VARCHAR(30),
    "moodle_user_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200),
    "bio" TEXT,
    "photo_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" TEXT[],
    "contents" TEXT[],
    "requirements" TEXT,
    "certification_info" TEXT,
    "modality" "Modality" NOT NULL,
    "duration_hours" INTEGER NOT NULL,
    "area_id" UUID NOT NULL,
    "image_url" VARCHAR(500),
    "image_alt" VARCHAR(300),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "CourseStatus" NOT NULL DEFAULT 'draft',
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(170),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "search" tsvector,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_instructors" (
    "course_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "course_instructors_pkey" PRIMARY KEY ("course_id","instructor_id")
);

-- CreateTable
CREATE TABLE "course_editions" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "enrollment_opens_at" TIMESTAMPTZ(3),
    "enrollment_closes_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "price_clp" INTEGER NOT NULL,
    "tax_treatment" "TaxTreatment" NOT NULL DEFAULT 'exempt',
    "schedule" VARCHAR(300),
    "location" VARCHAR(300),
    "moodle_course_id" VARCHAR(50),
    "passing_criterion" "PassingCriterion" NOT NULL DEFAULT 'completion',
    "passing_grade" DECIMAL(5,2),
    "certificate_template" VARCHAR(100),
    "free_for_community" BOOLEAN NOT NULL DEFAULT false,
    "community_profiles" "CommunityProfile"[],
    "status" "EditionStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "subtotal_clp" INTEGER NOT NULL,
    "discount_clp" INTEGER NOT NULL DEFAULT 0,
    "total_clp" INTEGER NOT NULL,
    "coupon_id" UUID,
    "document_type" "SalesDocumentType" NOT NULL DEFAULT 'receipt',
    "legal_versions" JSONB,
    "legal_hash" VARCHAR(64),
    "legal_accepted_ip" VARCHAR(45),
    "legal_accepted_at" TIMESTAMPTZ(3),
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(150),
    "utm_term" VARCHAR(150),
    "utm_content" VARCHAR(150),
    "lead_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "course_title" VARCHAR(200) NOT NULL,
    "unit_price_clp" INTEGER NOT NULL,
    "discount_clp" INTEGER NOT NULL DEFAULT 0,
    "total_clp" INTEGER NOT NULL,
    "tax_treatment" "TaxTreatment" NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_changes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "buy_order" VARCHAR(26) NOT NULL,
    "token" VARCHAR(100),
    "amount_clp" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "authorization_code" VARCHAR(20),
    "card_last4" VARCHAR(4),
    "payment_type" VARCHAR(10),
    "installments" INTEGER,
    "raw_response" JSONB,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_clp" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'requested',
    "reason" VARCHAR(500) NOT NULL,
    "provider_response" JSONB,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "requested_by_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "order_item_id" UUID,
    "source" "EnrollmentSource" NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'pending_lms',
    "lms_sync_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_lms_error" VARCHAR(1000),
    "grade" DECIMAL(5,2),
    "enrolled_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_reservations" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "status" "SeatReservationStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seat_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "edition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "notified_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "scope" "CouponScope" NOT NULL DEFAULT 'all',
    "course_id" UUID,
    "edition_id" UUID,
    "valid_from" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "max_uses" INTEGER,
    "max_uses_per_user" INTEGER DEFAULT 1,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "reason" "CouponReason" NOT NULL DEFAULT 'promotion',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "recipient_name" VARCHAR(200) NOT NULL,
    "grade" DECIMAL(5,2),
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "pdf_sha256" VARCHAR(64),
    "status" "CertificateStatus" NOT NULL DEFAULT 'valid',
    "previous_certificate_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" VARCHAR(500),
    "validator_sync_status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "validator_synced_at" TIMESTAMPTZ(3),
    "validator_last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_documents" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "SalesDocumentType" NOT NULL,
    "receiver_rut" VARCHAR(12),
    "receiver_name" VARCHAR(200),
    "receiver_activity" VARCHAR(200),
    "receiver_address" VARCHAR(300),
    "status" "SalesDocumentStatus" NOT NULL DEFAULT 'pending',
    "external_folio" VARCHAR(50),
    "exported_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(200),
    "course_id" UUID,
    "consent_text" TEXT NOT NULL,
    "consent_version" VARCHAR(20) NOT NULL,
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "utm_source" VARCHAR(100),
    "utm_medium" VARCHAR(100),
    "utm_campaign" VARCHAR(150),
    "utm_term" VARCHAR(150),
    "utm_content" VARCHAR(150),
    "status" "LeadStatus" NOT NULL DEFAULT 'active',
    "unsubscribe_token" VARCHAR(64) NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_deliveries" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "content_sha256" VARCHAR(64) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" VARCHAR(100),
    "actor_role" VARCHAR(50),
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(100),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_sga_user_id_key" ON "users"("sga_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_idp_subject_key" ON "users"("idp_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_rut_key" ON "users"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "areas_slug_key" ON "areas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_search_idx" ON "courses" USING GIN ("search");

-- CreateIndex
CREATE INDEX "courses_status_featured_idx" ON "courses"("status", "featured");

-- CreateIndex
CREATE INDEX "courses_area_id_idx" ON "courses"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_editions_code_key" ON "course_editions"("code");

-- CreateIndex
CREATE INDEX "course_editions_course_id_status_starts_at_idx" ON "course_editions"("course_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_edition_id_key" ON "cart_items"("cart_id", "edition_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_edition_id_key" ON "order_items"("order_id", "edition_id");

-- CreateIndex
CREATE INDEX "order_status_changes_order_id_created_at_idx" ON "order_status_changes"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_buy_order_key" ON "payments"("buy_order");

-- CreateIndex
CREATE UNIQUE INDEX "payments_token_key" ON "payments"("token");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_order_item_id_key" ON "enrollments"("order_item_id");

-- CreateIndex
CREATE INDEX "enrollments_edition_id_status_idx" ON "enrollments"("edition_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_edition_id_key" ON "enrollments"("user_id", "edition_id");

-- CreateIndex
CREATE INDEX "seat_reservations_edition_id_status_expires_at_idx" ON "seat_reservations"("edition_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "waitlist_entries_edition_id_status_position_idx" ON "waitlist_entries"("edition_id", "status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_edition_id_user_id_key" ON "waitlist_entries"("edition_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_user_id_idx" ON "coupon_redemptions"("coupon_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_previous_certificate_id_key" ON "certificates"("previous_certificate_id");

-- CreateIndex
CREATE INDEX "certificates_enrollment_id_idx" ON "certificates"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_order_id_key" ON "sales_documents"("order_id");

-- CreateIndex
CREATE INDEX "sales_documents_status_idx" ON "sales_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_unsubscribe_token_key" ON "leads"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_deliveries_campaign_id_lead_id_key" ON "campaign_deliveries"("campaign_id", "lead_id");

-- CreateIndex
CREATE INDEX "legal_documents_type_effective_from_idx" ON "legal_documents"("type", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_instructors" ADD CONSTRAINT "course_instructors_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_editions" ADD CONSTRAINT "course_editions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_previous_certificate_id_fkey" FOREIGN KEY ("previous_certificate_id") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_deliveries" ADD CONSTRAINT "campaign_deliveries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- SQL propio (no lo genera Prisma)
-- =============================================================================

-- Búsqueda de texto del catálogo (RF-01): configuración `spanish` sin tildes.
-- `unaccent` es una extensión confiable de PostgreSQL (contrib), disponible en la imagen oficial.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `unaccent()` es STABLE; esta envoltura con diccionario explícito es IMMUTABLE y sirve para
-- índices y para normalizar las consultas igual que los documentos.
CREATE OR REPLACE FUNCTION immutable_unaccent(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, input) $$;

CREATE OR REPLACE FUNCTION courses_search_refresh() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.search :=
    setweight(to_tsvector('spanish', immutable_unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('spanish', immutable_unaccent(coalesce(NEW.summary, ''))), 'B') ||
    setweight(to_tsvector('spanish', immutable_unaccent(
      coalesce(array_to_string(NEW.objectives, ' '), '') || ' ' ||
      coalesce(array_to_string(NEW.contents, ' '), '')
    )), 'C') ||
    setweight(to_tsvector('spanish', immutable_unaccent(coalesce(NEW.description, ''))), 'D');
  RETURN NEW;
END
$$;

CREATE TRIGGER courses_search_refresh
  BEFORE INSERT OR UPDATE OF title, summary, description, objectives, contents ON "courses"
  FOR EACH ROW EXECUTE FUNCTION courses_search_refresh();

-- Sin borrado físico de órdenes, pagos ni auditoría; auditoría e historial append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on table % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER order_status_changes_append_only BEFORE UPDATE OR DELETE ON "order_status_changes"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER order_status_changes_no_truncate BEFORE TRUNCATE ON "order_status_changes"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER orders_no_delete BEFORE DELETE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER orders_no_truncate BEFORE TRUNCATE ON "orders"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER order_items_no_delete BEFORE DELETE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER order_items_no_truncate BEFORE TRUNCATE ON "order_items"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER payments_no_delete BEFORE DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON "payments"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER refunds_no_delete BEFORE DELETE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER refunds_no_truncate BEFORE TRUNCATE ON "refunds"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Reglas de integridad: dinero en enteros no negativos, cupos y fechas coherentes.
ALTER TABLE "course_editions"
  ADD CONSTRAINT course_editions_price_check CHECK (price_clp >= 0),
  ADD CONSTRAINT course_editions_capacity_check CHECK (capacity >= 0),
  ADD CONSTRAINT course_editions_dates_check CHECK (ends_at >= starts_at),
  ADD CONSTRAINT course_editions_enrollment_dates_check
    CHECK (enrollment_opens_at IS NULL OR enrollment_opens_at <= enrollment_closes_at);
ALTER TABLE "courses" ADD CONSTRAINT courses_duration_check CHECK (duration_hours > 0);
ALTER TABLE "orders"
  ADD CONSTRAINT orders_amounts_check
    CHECK (subtotal_clp >= 0 AND discount_clp >= 0 AND total_clp >= 0
           AND total_clp = subtotal_clp - discount_clp);
ALTER TABLE "order_items"
  ADD CONSTRAINT order_items_amounts_check
    CHECK (unit_price_clp >= 0 AND discount_clp >= 0 AND total_clp >= 0);
ALTER TABLE "payments" ADD CONSTRAINT payments_amount_check CHECK (amount_clp >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT refunds_amount_check CHECK (amount_clp > 0);
ALTER TABLE "coupons"
  ADD CONSTRAINT coupons_value_check
    CHECK (value > 0 AND (type <> 'percentage' OR value <= 100)),
  ADD CONSTRAINT coupons_uses_check CHECK (uses_count >= 0);
ALTER TABLE "waitlist_entries" ADD CONSTRAINT waitlist_entries_position_check CHECK (position > 0);
