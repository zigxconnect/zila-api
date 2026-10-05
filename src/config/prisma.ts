import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || '';

const adapter = new PrismaPg({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

// Singleton Prisma instance to avoid connection pool exhaustion
export const prisma = new PrismaClient({ adapter });

/**
 * Resilient database query executor with automated retry for transient Neon serverless connection drops / timeouts
 */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 800): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'EAI_AGAIN' ||
        err?.code === 'ECONNRESET' ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.message?.includes('timed out');
      if (attempt < retries && isTransient) {
        console.warn(`[Prisma] Transient DB error (${err?.code || err?.message}) on attempt ${attempt + 1}/${retries + 1}, retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

