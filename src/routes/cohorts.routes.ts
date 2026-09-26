import { Router, Response } from 'express';
import { prisma } from '../config/prisma';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { CohortService } from '../services/cohort.service';

const router = Router();

/**
 * @swagger
 * /api/cohorts:
 *   get:
 *     summary: Get all cohorts (filtered by active, department, level)
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { active, department, level } = req.query;

    const where: any = {};
    if (active !== undefined) where.isActive = active === 'true';
    if (department) where.department = department as string;
    if (level) where.level = level as string;

    const cohorts = await prisma.cohort.findMany({
      where,
      include: {
        _count: {
          select: { students: true, tasks: true, documents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ cohorts });
  } catch (error: any) {
    console.error('Error fetching cohorts:', error);
    return res.status(500).json({ error: 'Failed to fetch cohorts' });
  }
});

/**
 * @swagger
 * /api/cohorts/my-cohorts:
 *   get:
 *     summary: Get cohorts the authenticated student is enrolled in (synced with Supabase placements)
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-cohorts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const cohorts = await CohortService.getStudentCohorts(userId);
    return res.json({ cohorts });
  } catch (error: any) {
    console.error('Error fetching student cohorts:', error);
    return res.status(500).json({ error: 'Failed to fetch your cohorts' });
  }
});

/**
 * @swagger
 * /api/cohorts/sync:
 *   post:
 *     summary: Synchronize student placements from Supabase to Neon DB cohorts
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sync', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const synced = await CohortService.syncStudentPlacements(userId);
    return res.json({ success: true, count: synced.length, cohorts: synced });
  } catch (error: any) {
    console.error('Error synchronizing cohorts:', error);
    return res.status(500).json({ error: 'Failed to synchronize cohorts' });
  }
});

/**
 * @swagger
 * /api/cohorts/group:
 *   get:
 *     summary: Quick access to active cohort peers and supervisor for CLI zila group
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/group', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const cohorts = await CohortService.getStudentCohorts(userId);

    if (cohorts.length === 0) {
      return res.json({
        cohort: null,
        supervisor: null,
        peers: [],
        totalPeers: 0,
        message: 'No active cohort placements found. Apply or wait for acceptance.',
      });
    }

    const activeCohort = cohorts[0];
    const peers = await CohortService.getCohortPeers(activeCohort.id, userId);

    const supervisor = activeCohort.supervisorId
      ? {
          id: activeCohort.supervisorId,
          name: activeCohort.supervisorName || 'Assigned Supervisor',
          email: activeCohort.supervisorEmail || '',
          role: 'admin',
        }
      : null;

    return res.json({
      cohort: activeCohort,
      supervisor,
      peers,
      totalPeers: peers.length,
    });
  } catch (error: any) {
    console.error('Error fetching active group:', error);
    return res.status(500).json({ error: 'Failed to fetch group details' });
  }
});

/**
 * @swagger
 * /api/cohorts/{cohortId}:
 *   get:
 *     summary: Get cohort details
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;

    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        students: {
          select: {
            id: true,
            studentId: true,
            studentName: true,
            studentEmail: true,
            avatarUrl: true,
            role: true,
            joinedAt: true,
            status: true,
          },
        },
        tasks: {
          orderBy: { dueDate: 'asc' },
        },
        documents: {
          where: { isPublic: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { students: true, tasks: true, documents: true },
        },
      },
    });

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    return res.json({ cohort });
  } catch (error: any) {
    console.error('Error fetching cohort:', error);
    return res.status(500).json({ error: 'Failed to fetch cohort details' });
  }
});

/**
 * @swagger
 * /api/cohorts/{cohortId}/peers:
 *   get:
 *     summary: Get fellow interns (peers) in the same cohort
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId/peers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const userId = req.user.sub || req.user.id;

    // Verify enrollment
    const enrollment = await prisma.cohortStudent.findFirst({
      where: { cohortId, studentId: userId },
    });

    if (!enrollment) {
      // Try on-demand sync in case placement was recently accepted in Supabase
      await CohortService.syncStudentPlacements(userId);
    }

    const peers = await CohortService.getCohortPeers(cohortId, userId);

    return res.json({
      peers,
      totalPeers: peers.length,
    });
  } catch (error: any) {
    console.error('Error fetching peers:', error);
    return res.status(500).json({ error: 'Failed to fetch peers' });
  }
});

/**
 * @swagger
 * /api/cohorts/{cohortId}/chat-group:
 *   get:
 *     summary: Get Bluetooth group chat context with supervisor as admin
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId/chat-group', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const userId = req.user.sub || req.user.id;

    const chatContext = await CohortService.getBluetoothChatContext(cohortId, userId);
    return res.json({ chatContext });
  } catch (error: any) {
    console.error('Error fetching chat group context:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch chat group context' });
  }
});

/**
 * @swagger
 * /api/cohorts:
 *   post:
 *     summary: Create a new cohort (Supervisor only)
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors and admins can create cohorts' });
    }

    const {
      name,
      programId,
      programType,
      department,
      level,
      startDate,
      endDate,
      maxStudents,
      description,
      githubRepoUrl,
    } = req.body;

    if (!name || !programId || !department) {
      return res.status(400).json({ error: 'Missing required cohort fields' });
    }

    const newCohort = await prisma.cohort.create({
      data: {
        name,
        programId,
        programType: programType || 'internship',
        department,
        level: level || 'intermediate',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : new Date(Date.now() + 90 * 24 * 3600 * 1000),
        maxStudents: maxStudents || null,
        description: description || null,
        supervisorId: userId,
        githubRepoUrl: githubRepoUrl || null,
        isActive: true,
      },
    });

    return res.status(201).json({ cohort: newCohort });
  } catch (error: any) {
    console.error('Error creating cohort:', error);
    return res.status(500).json({ error: 'Failed to create cohort' });
  }
});

export default router;
