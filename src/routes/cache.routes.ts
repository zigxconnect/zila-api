import { Router, Request, Response } from 'express';
import { CacheService } from '../services/cache.service';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/cache/stats:
 *   get:
 *     summary: Retrieve in-memory cache statistics and health
 *     description: Returns real-time telemetry from CacheService including hits, misses, hit ratio percentage, active keys, memory usage estimation, and uptime.
 *     tags: [Cache]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache telemetry statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CacheStats'
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = CacheService.getStats();
    return res.json({
      success: true,
      cache: stats,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve cache stats' });
  }
});

/**
 * @swagger
 * /api/cache/keys:
 *   get:
 *     summary: List active cached keys and TTL metadata
 *     description: Inspects all non-expired cached keys, remaining TTLs in seconds, expiration timestamps, and hit counts.
 *     tags: [Cache]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active cache keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalKeys:
 *                   type: number
 *                   example: 4
 *                 keys:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CacheKeyInfo'
 */
router.get('/keys', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const keys = CacheService.getKeys();
    return res.json({
      success: true,
      totalKeys: keys.length,
      keys,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to retrieve cache keys' });
  }
});

/**
 * @swagger
 * /api/cache/invalidate:
 *   post:
 *     summary: Invalidate cached entries by key, prefix, or flush all
 *     description: Clears in-memory cached entries matching an optional key or prefix, or flushes entire store if neither is provided.
 *     tags: [Cache]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               key:
 *                 type: string
 *                 example: 'cohort:cmui7022b00001q8kvt07u5f6'
 *               prefix:
 *                 type: string
 *                 example: 'cohort'
 *     responses:
 *       200:
 *         description: Cache invalidation executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 'Cache cleared successfully'
 *                 clearedCount:
 *                   type: number
 *                   example: 3
 */
router.post('/invalidate', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key, prefix } = req.body || {};

    if (key) {
      const deleted = CacheService.del(key);
      return res.json({
        success: true,
        message: deleted ? `Cache key '${key}' cleared` : `Cache key '${key}' was not found`,
        clearedCount: deleted ? 1 : 0,
      });
    }

    if (prefix) {
      const count = CacheService.invalidatePrefix(prefix);
      return res.json({
        success: true,
        message: `Cleared ${count} keys matching prefix '${prefix}'`,
        clearedCount: count,
      });
    }

    const count = CacheService.clear();
    return res.json({
      success: true,
      message: `Entire cache cleared (${count} entries evicted)`,
      clearedCount: count,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to invalidate cache' });
  }
});

export default router;
