-- Fase 3 (checkout): idempotencia de la confirmación, número de orden legible y versiones
-- legales inmutables.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "idempotency_key" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- Correlativo del número de orden (UTA-AAAA-000001). Una secuencia no se repite aunque una
-- transacción falle: puede haber saltos, nunca duplicados.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;

-- RF-11: una versión legal publicada no se modifica ni se borra (las órdenes guardan su hash).
CREATE TRIGGER legal_documents_append_only BEFORE UPDATE OR DELETE ON "legal_documents"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER legal_documents_no_truncate BEFORE TRUNCATE ON "legal_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
