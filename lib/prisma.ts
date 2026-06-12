/**
 * Prisma client singleton.
 * Prisma 7 `prisma-client` generator requires a driver adapter — we use
 * @prisma/adapter-pg over node-postgres against DATABASE_URL (the URL lives
 * in env via prisma.config.ts, never in schema.prisma).
 * Generated client output: /lib/generated/prisma (no src/ in this repo).
 * Run `bun run db:generate` before first typecheck.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
