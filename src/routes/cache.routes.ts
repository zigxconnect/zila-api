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

export default router;
