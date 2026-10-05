import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma, withDbRetry } from '../config/prisma';
import { GitHubPrSyncService } from '../services/github-sync.service';
import { CacheService } from '../services/cache.service';

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
    const cacheKey = `leaderboard:${cohortId}:${limit}`;

    // Await sync BEFORE checking cache so fresh data is used
    const synced = await GitHubPrSyncService.syncPendingSubmissions(cohortId);
    if (synced > 0) {
      // Bust cache when new merges were detected
      CacheService.del(cacheKey);
    }

    const cached = CacheService.get<any>(cacheKey);
    if (cached) {
      return res.json({ leaderboard: cached });
    }

    // Fetch students enrolled in this cohort
    const students = await withDbRetry(() =>
      prisma.cohortStudent.findMany({
        where: {
          cohortId,
          status: 'active',
        },
        include: {
          tasksSubmitted: {
            orderBy: { submittedAt: 'desc' },
            take: 1,
          },
          weeklyScores: {
            orderBy: { weekNumber: 'desc' },
            take: 1,
          },
        },
      })
    );

    // Bulk fetch all enrollments, points, and submissions to avoid N+1 database roundtrips
    const studentUserIds = students.map((s) => s.studentId).filter(Boolean);

    const allEnrollments = await withDbRetry(() =>
      prisma.cohortStudent.findMany({
        where: { studentId: { in: studentUserIds } },
        select: { id: true, studentId: true },
      })
    );

    const allEnrollmentIds = allEnrollments.map((e) => e.id);
    const userEnrollmentMap = new Map<string, string[]>();
    const enrollmentUserMap = new Map<string, string>();

    for (const e of allEnrollments) {
      enrollmentUserMap.set(e.id, e.studentId);
      const list = userEnrollmentMap.get(e.studentId) || [];
      list.push(e.id);
      userEnrollmentMap.set(e.studentId, list);
    }

    const [allPoints, allSubmissions] = await Promise.all([
      withDbRetry(() =>
        prisma.gamificationPoint.findMany({
          where: { studentId: { in: allEnrollmentIds } },
          select: { studentId: true, points: true },
        })
      ),
      withDbRetry(() =>
        prisma.taskSubmission.findMany({
          where: { studentId: { in: allEnrollmentIds } },
          orderBy: { submittedAt: 'desc' },
          select: { studentId: true, status: true, githubPrUrl: true, submittedAt: true },
        })
      ),
    ]);

    // Map total points per user
    const userPointsMap = new Map<string, number>();
    for (const gp of allPoints) {
      const userId = enrollmentUserMap.get(gp.studentId);
      if (userId) {
        userPointsMap.set(userId, (userPointsMap.get(userId) || 0) + gp.points);
      }
    }

    // Map latest submission per user
    const userSubmissionsMap = new Map<string, any[]>();
    for (const sub of allSubmissions) {
      const userId = enrollmentUserMap.get(sub.studentId);
      if (userId) {
        const list = userSubmissionsMap.get(userId) || [];
        list.push(sub);
        userSubmissionsMap.set(userId, list);
      }
    }

    const leaderboard = students.map((student) => {
      const totalPoints = userPointsMap.get(student.studentId) || 0;
      const thisCohortSub = student.tasksSubmitted[0];
      const userSubs = userSubmissionsMap.get(student.studentId) || [];

      let prStatus: 'pending' | 'accepted' | 'rejected' | 'none' = 'none';
      let prUrl = thisCohortSub?.githubPrUrl || null;

      if (thisCohortSub) {
        if (thisCohortSub.status === 'approved' || thisCohortSub.status === 'accepted') {
          prStatus = 'accepted';
        } else if (thisCohortSub.status === 'rejected') {
          prStatus = 'rejected';
        } else {
          prStatus = 'pending';
        }
      } else if (userSubs.length > 0) {
        const approvedSub = userSubs.find((s) => s.status === 'approved' || s.status === 'accepted');
        if (approvedSub) {
          prStatus = 'accepted';
          prUrl = approvedSub.githubPrUrl;
        } else {
          const rejectedSub = userSubs.find((s) => s.status === 'rejected');
          if (rejectedSub) {
            prStatus = 'rejected';
            prUrl = rejectedSub.githubPrUrl;
          } else {
            prStatus = 'pending';
            prUrl = userSubs[0].githubPrUrl;
          }
        }
      }

      return {
        studentId: student.studentId,
        studentName: student.studentName,
        studentEmail: student.studentEmail,
        totalPoints,
        latestScore: student.weeklyScores[0]?.overallScore || 0,
        status: prStatus,
        latestPrUrl: prUrl,
        rank: 0,
      };
    });

    const ranked = leaderboard
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, parseInt(limit as string))
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    CacheService.set(cacheKey, ranked, 30); // 30s cache (shorter to stay fresh)
    return res.json({ leaderboard: ranked });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    const { cohortId } = req.params;
    const { limit = '10' } = req.query;

    const fallback = CacheService.get<any>(`leaderboard:${cohortId}:${limit}`);
    if (fallback) {
      return res.json({ leaderboard: fallback });
    }
    return res.status(500).json({ error: error.message || 'Failed to fetch leaderboard' });
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
