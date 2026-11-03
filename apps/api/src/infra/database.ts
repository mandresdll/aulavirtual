import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}

export function databaseReadinessCheck(prisma: PrismaClient) {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}
