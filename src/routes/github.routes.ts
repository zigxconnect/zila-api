import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
const router = Router();

/**
 * @swagger
 * /api/github/repos:
 *   get:
 *     summary: Get all GitHub repositories
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.get('/repos', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId, type } = req.query;

    const where: any = { isActive: true };
    if (cohortId) where.cohortId = cohortId as string;
    if (type) where.type = type as string;

    const repos = await prisma.gitHubRepository.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ repos });
  } catch (error: any) {
    console.error('Error fetching GitHub repos:', error);
    return res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

/**
 * @swagger
 * /api/github/repos:
 *   post:
 *     summary: Add a GitHub repository (Supervisor only)
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.post('/repos', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can add repositories' });
    }

    // Get supervisor profile
    const { data: supervisor, error } = await supabase
      .from('supervisor_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !supervisor) {
      return res.status(404).json({ error: 'Supervisor profile not found' });
    }

    const { cohortId, name, url, description, type } = req.body;

    // Validate URL format
    if (!url.startsWith('https://github.com/')) {
      return res.status(400).json({ error: 'Invalid GitHub URL' });
    }

    const repo = await prisma.gitHubRepository.create({
      data: {
        cohortId,
        name,
        url,
        description,
        type,
        addedBy: userId,
        addedByName: supervisor.full_name,
        isActive: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Repository added successfully',
      repo
    });
  } catch (error: any) {
    console.error('Error adding repository:', error);
    return res.status(500).json({ error: 'Failed to add repository' });
  }
});

/**
 * @swagger
 * /api/github/repos/{repoId}:
 *   delete:
 *     summary: Remove a GitHub repository (Supervisor only)
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/repos/:repoId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { repoId } = req.params;
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can remove repositories' });
    }

    await prisma.gitHubRepository.delete({
      where: { id: repoId }
    });

    return res.json({
      success: true,
      message: 'Repository removed successfully'
    });
  } catch (error: any) {
    console.error('Error removing repository:', error);
    return res.status(500).json({ error: 'Failed to remove repository' });
  }
});

export default router;
