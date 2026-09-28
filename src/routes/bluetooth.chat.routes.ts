/**
 * @swagger
 * /api/cohorts/{cohortId}/chat-group:
 *   get:
 *     summary: Get the chat group for the cohort and level you belong to 
 *     tags: [Cohorts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId/chat-group', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
