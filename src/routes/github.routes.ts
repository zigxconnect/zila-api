import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';
import { CohortService } from '../services/cohort.service';
import { sendTaskSubmissionEmail } from '../services/email.service';
import { GitHubPrSyncService } from '../services/github-sync.service';

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
 *     description: Returns primary repo URL and sample ML repo fallback (https://github.com/iws3/sample_repo_zila.git).
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active cohort repository metadata
 *       404:
 *         description: No active cohort found
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

    // Also check if cohort itself has githubRepoUrl, or fallback to the sample ML repository
    let primaryUrl = activeCohort.githubRepoUrl;
    if (!primaryUrl && repos.length > 0) {
      primaryUrl = repos[0].url;
    }
    if (!primaryUrl) {
      primaryUrl = 'https://github.com/iws3/sample_repo_zila.git';
    }

    return res.json({
      cohort: {
        id: activeCohort.id,
        name: activeCohort.name,
        department: activeCohort.department,
      },
      primaryRepoUrl: primaryUrl,
      sampleRepoUrl: 'https://github.com/iws3/sample_repo_zila.git',
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

/**
 * @swagger
 * /api/github/webhook:
 *   post:
 *     summary: GitHub Webhook handler for PR merge and closure events
 *     description: Automatically detects when an intern's pull request is merged on GitHub, updates task submission status to approved, increments points, and sends confirmation email.
 *     tags: [GitHub]
 */
router.post('/webhook', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const body = req.body;

    if (event === 'pull_request') {
      const action = body.action;
      const pr = body.pull_request;
      if (pr) {
        const prUrl = pr.html_url;
        const isMerged = Boolean(pr.merged || pr.merged_at);
        const isClosed = action === 'closed' || pr.state === 'closed';

        // Find task submission matching this PR URL
        const submission = await prisma.taskSubmission.findFirst({
          where: {
            OR: [
              { githubPrUrl: prUrl },
              { githubPrUrl: { contains: `/pull/${pr.number}` } },
            ],
          },
          include: {
            task: true,
            student: true,
          },
        });

        if (submission && submission.status === 'submitted') {
          if (isMerged) {
            const pointsToAward = submission.task.maxPoints && submission.task.maxPoints <= 4 ? submission.task.maxPoints : 1;
            await prisma.taskSubmission.update({
              where: { id: submission.id },
              data: {
                status: 'approved',
                pointsEarned: pointsToAward,
                feedback: 'Pull request successfully merged into cohort repository.',
                reviewedAt: new Date(pr.merged_at || Date.now()),
              },
            });

            await prisma.gamificationPoint.create({
              data: {
                studentId: submission.studentId,
                pointType: 'task_completion',
                points: pointsToAward,
                reason: `PR merged for "${submission.task.title}"`,
                relatedTaskId: submission.taskId,
              },
            });

            if (submission.student?.studentEmail) {
              await sendTaskSubmissionEmail(submission.student.studentEmail, submission.student.studentName || 'Student', {
                prUrl,
                branch: submission.githubBranch || 'main',
                module: submission.task.title,
                day: 1,
                domain: 'Cohort Task',
                status: 'accepted',
                pointsAwarded: pointsToAward,
              }).catch(() => {});
            }
          } else if (isClosed && !isMerged) {
            await prisma.taskSubmission.update({
              where: { id: submission.id },
              data: {
                status: 'rejected',
                feedback: 'Pull request closed without merge.',
                reviewedAt: new Date(pr.closed_at || Date.now()),
              },
            });

            if (submission.student?.studentEmail) {
              await sendTaskSubmissionEmail(submission.student.studentEmail, submission.student.studentName || 'Student', {
                prUrl,
                branch: submission.githubBranch || 'main',
                module: submission.task.title,
                day: 1,
                domain: 'Cohort Task',
                status: 'rejected',
              }).catch(() => {});
            }
          }
        }
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.warn('[GitHub Webhook] Error:', err.message);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

/**
 * @swagger
 * /api/github/sync-pr:
 *   post:
 *     summary: Synchronize and check PR status from GitHub REST API
 *     description: Checks open pull requests on GitHub, detects if merged or closed, updates DB, awards points, and sends emails.
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sync-pr', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.body;
    const syncedCount = await GitHubPrSyncService.syncPendingSubmissions(cohortId);
    return res.json({ success: true, message: `Synced ${syncedCount} PR submissions from GitHub`, syncedCount });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to sync PRs' });
  }
});

export default router;
