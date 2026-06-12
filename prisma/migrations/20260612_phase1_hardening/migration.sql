-- Phase 1 additive hardening. All columns are nullable so existing rows remain
-- valid. Apply to development through the repository's Bun migration command;
-- do not apply to production without explicit human approval.

ALTER TABLE "Case"
  ADD COLUMN "failureReason" TEXT;

ALTER TABLE "Diagnosis"
  ADD COLUMN "sourceJobId" UUID;

ALTER TABLE "GeneratedLetter"
  ADD COLUMN "sourceJobId" UUID;

ALTER TABLE "PipelineJob"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Diagnosis_sourceJobId_key"
  ON "Diagnosis"("sourceJobId");

CREATE UNIQUE INDEX "GeneratedLetter_sourceJobId_key"
  ON "GeneratedLetter"("sourceJobId");

CREATE UNIQUE INDEX "PipelineJob_idempotencyKey_key"
  ON "PipelineJob"("idempotencyKey");
