import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || '';

const adapter = new PrismaPg({
  connectionString,
});

// Singleton Prisma instance to avoid connection pool exhaustion
export const prisma = new PrismaClient({ adapter });
