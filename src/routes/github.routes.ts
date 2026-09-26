import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';
import { CohortService } from '../services/cohort.service';

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
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ repos });
  } catch (error: any) {
    console.error('Error fetching GitHub repos:', error);
    return res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

/**
 * @swagger
 * /api/github/active:
 *   get:
 *     summary: Get GitHub repo and materials for the student's active cohort (for zila downloads)
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.get('/active', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const cohorts = await CohortService.getStudentCohorts(userId);

    if (cohorts.length === 0) {
      return res.status(404).json({ error: 'No active cohort found for your account' });
    }

    const activeCohort = cohorts[0];

    // Find repos linked to this cohort or general repos
    const repos = await prisma.gitHubRepository.findMany({
      where: {
        OR: [
          { cohortId: activeCohort.id },
          { cohortId: null },
        ],
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also check if cohort itself has githubRepoUrl
    let primaryUrl = activeCohort.githubRepoUrl;
    if (!primaryUrl && repos.length > 0) {
      primaryUrl = repos[0].url;
    }

    return res.json({
      cohort: {
        id: activeCohort.id,
        name: activeCohort.name,
        department: activeCohort.department,
      },
      primaryRepoUrl: primaryUrl || null,
      repos,
    });
  } catch (error: any) {
    console.error('Error fetching active cohort repo:', error);
    return res.status(500).json({ error: 'Failed to fetch active repository' });
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
    const { data: supervisor } = await supabase
      .from('supervisor_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const supervisorName = supervisor?.full_name || 'Supervisor';
    const { cohortId, name, url, description, type } = req.body;

    // Validate URL format
    if (!url || !url.startsWith('https://github.com/')) {
      return res.status(400).json({ error: 'Invalid GitHub URL. Must start with https://github.com/' });
    }

    const repo = await prisma.gitHubRepository.create({
      data: {
        cohortId: cohortId || null,
        name: name || url.split('/').pop() || 'Repository',
        url,
        description: description || null,
        type: type || 'learning_material',
        addedBy: userId,
        addedByName: supervisorName,
        isActive: true,
      },
    });

    // If cohortId provided, also update Cohort githubRepoUrl
    if (cohortId) {
      await prisma.cohort.update({
        where: { id: cohortId },
        data: { githubRepoUrl: url },
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      message: 'Repository added successfully',
      repo,
    });
  } catch (error: any) {
    console.error('Error adding repository:', error);
    return res.status(500).json({ error: 'Failed to add repository' });
  }
});

/**
 * @swagger
 * /api/github/repos/{id}:
 *   delete:
 *     summary: Remove a repository (Supervisor only)
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/repos/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';
    const { id } = req.params;

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can remove repositories' });
    }

    await prisma.gitHubRepository.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ success: true, message: 'Repository deactivated successfully' });
  } catch (error: any) {
    console.error('Error deleting repo:', error);
    return res.status(500).json({ error: 'Failed to delete repository' });
  }
});

export default router;
