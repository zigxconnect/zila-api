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

export default router;
