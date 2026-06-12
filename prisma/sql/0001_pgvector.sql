-- BankGuard AI — raw SQL companion to the first Prisma migration.
-- Apply after `bun x prisma migrate dev --name init` (or fold into the
-- generated migration.sql before running it).

-- 1. Extensions (also declared in schema.prisma datasource extensions[])
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. HNSW index for KB chunk retrieval (cosine distance)
CREATE INDEX IF NOT EXISTS kb_chunk_embedding_hnsw ON "KbChunk"
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 3. Reference: job-queue claim query used by /workflows workers
--    (documented here; executed via $queryRaw, not as a migration)
-- UPDATE "PipelineJob" SET status='RUNNING', "lockedAt"=now(), "lockedBy"=$1
-- WHERE id = ( SELECT id FROM "PipelineJob"
--              WHERE status='QUEUED' AND "runAfter" <= now()
--              ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1 )
-- RETURNING *;
