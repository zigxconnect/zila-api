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
 * /api/cohorts:
 *   get:
 *     summary: Get all cohorts (filtered by role)
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
          select: { students: true, tasks: true }
        }
      },
      orderBy: { createdAt: 'desc' }
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
 *     summary: Get cohorts the authenticated student is enrolled in
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-cohorts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;

    // Get student's cohorts
    const studentCohorts = await prisma.cohortStudent.findMany({
      where: { studentId: userId },
      include: {
        cohort: {
          include: {
            _count: {
              select: { students: true, tasks: true, documents: true }
            }
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    return res.json({
      cohorts: studentCohorts.map(sc => ({
        ...sc.cohort,
        enrollmentStatus: sc.status,
        joinedAt: sc.joinedAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching student cohorts:', error);
    return res.status(500).json({ error: 'Failed to fetch your cohorts' });
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
            joinedAt: true,
            status: true
          }
        },
        tasks: {
          orderBy: { dueDate: 'asc' }
        },
        documents: {
          where: { isPublic: true },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { students: true, tasks: true }
        }
      }
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
 *     summary: Get peers (colleagues) in the same cohort
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId/peers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const userId = req.user.sub || req.user.id;

    // Verify student is in this cohort
    const enrollment = await prisma.cohortStudent.findFirst({
      where: {
        cohortId,
        studentId: userId
      }
    });

    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this cohort' });
    }

    // Get all peers in the same cohort
    const peers = await prisma.cohortStudent.findMany({
      where: {
        cohortId,
        status: 'active',
        studentId: { not: userId } // Exclude current user
      },
      select: {
        id: true,
        studentId: true,
        studentName: true,
        studentEmail: true,
        joinedAt: true,
        status: true,
        gamificationPoints: {
          select: {
            points: true
          }
        }
      },
      orderBy: { joinedAt: 'asc' }
    });

    // Calculate total points for each peer
    const peersWithStats = peers.map(peer => ({
      ...peer,
      totalPoints: peer.gamificationPoints.reduce((sum, gp) => sum + gp.points, 0),
      gamificationPoints: undefined // Remove detailed breakdown
    }));

    return res.json({
      peers: peersWithStats,
      totalPeers: peersWithStats.length
    });
  } catch (error: any) {
    console.error('Error fetching peers:', error);
    return res.status(500).json({ error: 'Failed to fetch peers' });
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

    // Verify user is a supervisor
    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can create cohorts' });
    }

    const {
      name,
      programId,
      programType,
      startDate,
      endDate,
      maxStudents,
      description,
      department,
      level
    } = req.body;

    const cohort = await prisma.cohort.create({
      data: {
        name,
        programId,
        programType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxStudents,
        description,
        department,
        level,
        isActive: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Cohort created successfully',
      cohort
    });
  } catch (error: any) {
    console.error('Error creating cohort:', error);
    return res.status(500).json({ error: 'Failed to create cohort' });
  }
});

/**
 * @swagger
 * /api/cohorts/{cohortId}/join:
 *   post:
 *     summary: Join a cohort (Student enrolls themselves)
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:cohortId/join', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'student') {
      return res.status(403).json({ error: 'Only students can join cohorts' });
    }

    // Get student profile
    const { data: student, error } = await supabase
      .from('student_profiles')
      .select('full_name, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    // Check if cohort exists and has space
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        _count: { select: { students: true } }
      }
    });

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    if (!cohort.isActive) {
      return res.status(400).json({ error: 'This cohort is not accepting new students' });
    }

    if (cohort.maxStudents && cohort._count.students >= cohort.maxStudents) {
      return res.status(400).json({ error: 'Cohort is full' });
    }

    // Check if already enrolled
    const existing = await prisma.cohortStudent.findFirst({
      where: { cohortId, studentId: userId }
    });

    if (existing) {
      return res.status(400).json({ error: 'You are already enrolled in this cohort' });
    }

    // Enroll student
    const enrollment = await prisma.cohortStudent.create({
      data: {
        cohortId,
        studentId: userId,
        studentEmail: student.email,
        studentName: student.full_name,
        status: 'active'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Successfully joined cohort',
      enrollment
    });
  } catch (error: any) {
    console.error('Error joining cohort:', error);
    return res.status(500).json({ error: 'Failed to join cohort' });
  }
});

export default router;
