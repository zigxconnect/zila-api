import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';

const router = Router();

/**
 * @swagger
 * /api/gamification/my-stats:
 *   get:
 *     summary: Get gamification stats for the authenticated student
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;

    // Get student's enrollments
    const enrollments = await prisma.cohortStudent.findMany({
      where: { studentId: userId },
      include: {
        cohort: {
          select: {
            name: true,
            department: true,
            level: true
          }
        },
        gamificationPoints: true,
        weeklyScores: {
          orderBy: { weekNumber: 'desc' },
          take: 4
        }
      }
    });

    // Calculate total stats
    const totalPoints = enrollments.reduce((sum, enrollment) => {
      return sum + enrollment.gamificationPoints.reduce((s, gp) => s + gp.points, 0);
    }, 0);

    // Get achievements
    const achievements = await prisma.studentAchievement.findMany({
      where: {
        studentId: { in: enrollments.map(e => e.id) }
      },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });

    // Points breakdown by type
    const pointsBreakdown = enrollments.reduce((acc, enrollment) => {
      enrollment.gamificationPoints.forEach(gp => {
        acc[gp.pointType] = (acc[gp.pointType] || 0) + gp.points;
      });
      return acc;
    }, {} as Record<string, number>);

    return res.json({
      totalPoints,
      pointsBreakdown,
      achievements: achievements.map(a => ({
        ...a.achievement,
        earnedAt: a.earnedAt
      })),
      recentScores: enrollments.flatMap(e => e.weeklyScores),
      enrollments: enrollments.map(e => ({
        cohort: e.cohort,
        points: e.gamificationPoints.reduce((s, gp) => s + gp.points, 0)
      }))
    });
  } catch (error: any) {
    console.error('Error fetching gamification stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * @swagger
 * /api/gamification/leaderboard/{cohortId}:
 *   get:
 *     summary: Get leaderboard for a cohort with task PR submission status
 *     description: Returns sorted ranking of cohort members, points, latest weekly sprint score, and latest PR submission status (pending, accepted, rejected, none).
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cohortId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the cohort
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of leaderboard entries
 *     responses:
 *       200:
 *         description: Cohort leaderboard with PR status indicators
 */
router.get('/leaderboard/:cohortId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const { limit = '10' } = req.query;

    const students = await prisma.cohortStudent.findMany({
      where: {
        cohortId,
        status: 'active'
      },
      include: {
        gamificationPoints: true,
        tasksSubmitted: {
          orderBy: { submittedAt: 'desc' },
          take: 1
        },
        weeklyScores: {
          orderBy: { weekNumber: 'desc' },
          take: 1
        }
      }
    });

    // Calculate leaderboard with STATUS column
    const leaderboard = students.map(student => {
      const latestSub = student.tasksSubmitted[0];
      let prStatus: 'pending' | 'accepted' | 'rejected' | 'none' = 'none';
      if (latestSub) {
        if (latestSub.status === 'approved' || latestSub.status === 'accepted') {
          prStatus = 'accepted';
        } else if (latestSub.status === 'rejected') {
          prStatus = 'rejected';
        } else {
          prStatus = 'pending';
        }
      }

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        studentEmail: student.studentEmail,
        totalPoints: student.gamificationPoints.reduce((sum, gp) => sum + gp.points, 0),
        latestScore: student.weeklyScores[0]?.overallScore || 0,
        status: prStatus,
        latestPrUrl: latestSub?.githubPrUrl || null,
        rank: 0
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, parseInt(limit as string))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    return res.json({ leaderboard });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * @swagger
 * /api/gamification/achievements:
 *   get:
 *     summary: Get all available achievements
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 */
router.get('/achievements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const achievements = await prisma.achievement.findMany({
      orderBy: { pointsRequired: 'asc' }
    });

    return res.json({ achievements });
  } catch (error: any) {
    console.error('Error fetching achievements:', error);
    return res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * @swagger
 * /api/gamification/achievements:
 *   post:
 *     summary: Create a new achievement (Admin only)
 *     tags: [Gamification]
 *     security:
 *       - bearerAuth: []
 */
router.post('/achievements', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can create achievements' });
    }

    const { name, description, icon, category, pointsRequired, condition } = req.body;

    const achievement = await prisma.achievement.create({
      data: {
        name,
        description,
        icon,
        category,
        pointsRequired,
        condition
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Achievement created successfully',
      achievement
    });
  } catch (error: any) {
    console.error('Error creating achievement:', error);
    return res.status(500).json({ error: 'Failed to create achievement' });
  }
});

export default router;
