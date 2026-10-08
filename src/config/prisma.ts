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
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || '').toLowerCase();
      const isTransient =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'EAI_AGAIN' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'EPIPE' ||
        msg.includes('etimedout') ||
        msg.includes('timed out') ||
        msg.includes('econnreset') ||
        msg.includes('connection reset') ||
        msg.includes('connection closed') ||
        msg.includes('closed before secure') ||
        msg.includes('terminated');
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


