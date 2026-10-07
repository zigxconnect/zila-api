import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';
import { SubmissionQuotaService } from '../services/submission-quota.service';
import { ScoringNormalizationService } from '../services/scoring-normalization.service';
import { CurriculumService } from '../services/curriculum.service';
import { sendTaskSubmissionEmail } from '../services/email.service';

const router = Router();

/**
 * @swagger
 * /api/tasks/my-tasks:
 *   get:
 *     summary: Get all tasks assigned to the authenticated student
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-tasks', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const { status, cohortId } = req.query;

    // Get student's cohort enrollments
    const enrollments = await prisma.cohortStudent.findMany({
      where: {
        studentId: userId,
        ...(cohortId && { cohortId: cohortId as string })
      },
      select: { id: true, cohortId: true }
    });

    if (enrollments.length === 0) {
      return res.json({ tasks: [] });
    }

    const cohortIds = enrollments.map(e => e.cohortId);

    // Get all tasks for these cohorts
    const tasks = await prisma.task.findMany({
      where: {
        cohortId: { in: cohortIds }
      },
      include: {
        cohort: {
          select: {
            name: true,
            department: true,
            level: true
          }
        },
        submissions: {
          where: {
            studentId: { in: enrollments.map(e => e.id) }
          },
          orderBy: { submittedAt: 'desc' },
          take: 1
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    // Enrich tasks with submission status
    const tasksWithStatus = tasks.map(task => {
      const submission = task.submissions[0];
      return {
        ...task,
        submissions: undefined,
        mySubmission: submission || null,
        submissionStatus: submission?.status || 'not_submitted',
        isOverdue: task.dueDate ? new Date(task.dueDate) < new Date() && !submission : false
      };
    });

    return res.json({ tasks: tasksWithStatus });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * @swagger
 * /api/tasks/quota:
 *   get:
 *     summary: Get daily PR submission quota status for the student
 *     description: Returns remaining PR quota for today. Cohort rule allows 1 PR/day recommended, maximum 2 PRs per calendar day.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current daily PR submission quota
 */
router.get('/quota', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const enrollments = await prisma.cohortStudent.findMany({
      where: { studentId: userId, status: 'active' },
      select: { id: true }
    });

    if (enrollments.length === 0) {
      return res.json({
        quota: SubmissionQuotaService.evaluateQuota(0)
      });
    }

    const startOfDay = SubmissionQuotaService.getStartOfDayUTC();
    const countToday = await prisma.taskSubmission.count({
      where: {
        studentId: { in: enrollments.map(e => e.id) },
        submittedAt: { gte: startOfDay }
      }
    });

    return res.json({
      quota: SubmissionQuotaService.evaluateQuota(countToday)
    });
  } catch (error: any) {
    console.error('Error checking PR quota:', error);
    return res.status(500).json({ error: 'Failed to evaluate PR quota' });
  }
});

/**
 * @swagger
 * /api/tasks/scoring-rubric:
 *   get:
 *     summary: Retrieve day-based scoring weights normalized to 100%
 *     description: Returns rubric for exercise days (Day 1: 1pt, Day 2: 1pt, Day 3: 2pts, Day 4: 4pts) normalized over 100%.
 *     tags: [Tasks]
 *     responses:
 *       200:
 *         description: Normalized scoring rubric
 */
router.get('/scoring-rubric', (req, res) => {
  return res.json({
    rubric: ScoringNormalizationService.getRubric(),
    totalRawWeight: ScoringNormalizationService.TOTAL_RAW_WEIGHT,
    normalizedScale: 100
  });
});

/**
 * @swagger
 * /api/tasks/curriculum:
 *   get:
 *     summary: Retrieve multi-domain curriculum tracks (ML, Web, Cyber, Embedded, App, Cloud)
 *     description: Returns dynamic list of curriculum domains, descriptions, and tiered module blueprints.
 *     tags: [Tasks]
 *     responses:
 *       200:
 *         description: All available curriculum tracks and domains
 */
router.get('/curriculum', (req, res) => {
  return res.json({
    domains: CurriculumService.getAllDomains(),
    totalDomains: CurriculumService.getAllDomains().length,
  });
});

/**
 * @swagger
 * /api/tasks/auto-submit:
 *   post:
 *     summary: Automated background PR submission for cohort exercises across any domain
 *     description: Submits a cohort task solution directly from lil-zila's automated background PR pipeline supporting ML, Web, Cyber, Embedded, App, Cloud, or custom domains.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AutoSubmitTaskRequest'
 *     responses:
 *       201:
 *         description: Task submitted successfully with automated PR metadata
 *       400:
 *         description: Missing required GitHub PR URL
 *       403:
 *         description: Not enrolled in an active cohort
 *       429:
 *         description: Daily PR submission quota reached (max 2 PRs per calendar day)
 */
router.post('/auto-submit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const {
      cohortId,
      domain = 'ml',
      level = 'beginner',
      module = '1_python',
      day = 1,
      githubPrUrl,
      githubRepoUrl,
      githubBranch,
      commitHash,
      summary,
      challenges,
      deploymentUrl
    } = req.body;

    if (!githubPrUrl) {
      return res.status(400).json({ error: 'GitHub PR URL is required for task submission' });
    }

    // Resolve active student enrollment
    const enrollment = await prisma.cohortStudent.findFirst({
      where: {
        studentId: userId,
        status: 'active',
        ...(cohortId && { cohortId })
      },
      include: { cohort: true }
    });

    if (!enrollment) {
      return res.status(403).json({
        error: cohortId
          ? `You are not enrolled in the specified cohort (${cohortId})`
          : 'You are not enrolled in an active cohort'
      });
    }

    // Check daily PR quota
    const startOfDay = SubmissionQuotaService.getStartOfDayUTC();
    const countToday = await prisma.taskSubmission.count({
      where: {
        studentId: enrollment.id,
        submittedAt: { gte: startOfDay }
      }
    });

    const quota = SubmissionQuotaService.evaluateQuota(countToday);
    if (!quota.allowed) {
      return res.status(429).json({ error: quota.message, quota });
    }

    // Sanitize domain, module and clamp day between 1 and 4
    const cleanDomain = CurriculumService.sanitizePathComponent(domain || 'ml');
    const cleanModule = CurriculumService.sanitizePathComponent(module || '1_python');
    const dayNumber = Math.max(1, Math.min(4, Number(day) || 1));
    const taskTitle = `[${cleanDomain.toUpperCase()}] ${cleanModule} - Day 0${dayNumber}`;
    let task = await prisma.task.findFirst({
      where: {
        cohortId: enrollment.cohortId,
        title: { contains: taskTitle }
      }
    });

    if (!task) {
      // Auto-create task if not already created for this cohort curriculum
      task = await prisma.task.create({
        data: {
          cohortId: enrollment.cohortId,
          title: `Exercise: ${taskTitle}`,
          description: `Daily curriculum exercise for ${cleanDomain}/${level}/${cleanModule}/Day ${dayNumber}`,
          type: 'assignment',
          difficulty: level || 'beginner',
          skills: [cleanDomain, cleanModule],
          maxPoints: ScoringNormalizationService.getRubricMark(dayNumber),
          githubRequired: true,
          prRequired: true,
          assignedBy: enrollment.cohort.supervisorId || userId,
          assignedByName: enrollment.cohort.supervisorName || 'Cohort Supervisor',
          assignedByEmail: enrollment.cohort.supervisorEmail || 'supervisor@zigex.com'
        }
      });
    }

    // Create submission record
    const submissionContent = [
      `### Exercise Summary\n${summary || 'Automated exercise submission.'}`,
      challenges ? `### Challenges & Roadblocks\n${challenges}` : null,
      deploymentUrl ? `### Deployment URL\n${deploymentUrl}` : null,
      `### GitHub Metadata\n- PR: ${githubPrUrl}\n- Branch: ${githubBranch || 'automated'}\n- Commit: ${commitHash || 'latest'}`
    ].filter(Boolean).join('\n\n');

    const submission = await prisma.taskSubmission.create({
      data: {
        taskId: task.id,
        studentId: enrollment.id,
        title: `Day 0${dayNumber} Exercise Submission: ${module}`,
        description: summary || `PR created on ${githubBranch || 'branch'}`,
        content: submissionContent,
        githubRepoUrl: githubRepoUrl || 'https://github.com/iws3/sample_repo_zila.git',
        githubPrUrl,
        githubBranch,
        commitHash,
        status: 'submitted',
        submittedAt: new Date()
      }
    });

    // Note: Gamification marks and email notification are ONLY triggered
    // when the pull request is reviewed and merged by supervisors on GitHub.

    return res.status(201).json({
      success: true,
      message: 'Automated PR task submitted successfully',
      submission,
      quota: SubmissionQuotaService.evaluateQuota(countToday + 1),
      normalizedWeight: ScoringNormalizationService.getRubric().find(r => r.day === dayNumber)
    });
  } catch (error: any) {
    console.error('Error in auto-submit task:', error);
    return res.status(500).json({ error: error.message || 'Failed to submit automated task' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task details
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:taskId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.sub || req.user.id;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        cohort: true,
        submissions: {
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json({ task });
  } catch (error: any) {
    console.error('Error fetching task:', error);
    return res.status(500).json({ error: 'Failed to fetch task details' });
  }
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task (Supervisor only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can create tasks' });
    }

    // Get supervisor profile
    const { data: supervisor, error } = await supabase
      .from('supervisor_profiles')
      .select('full_name, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !supervisor) {
      return res.status(404).json({ error: 'Supervisor profile not found' });
    }

    const {
      cohortId,
      title,
      description,
      type,
      dueDate,
      maxPoints,
      difficulty,
      skills,
      githubRequired,
      prRequired,
      requiresReview
    } = req.body;

    // Verify cohort exists
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId }
    });

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const task = await prisma.task.create({
      data: {
        cohortId,
        title,
        description,
        type,
        dueDate: dueDate ? new Date(dueDate) : null,
        maxPoints: maxPoints || 100,
        difficulty,
        skills: skills || [],
        githubRequired: githubRequired || false,
        prRequired: prRequired || false,
        requiresReview: requiresReview !== false,
        assignedBy: userId,
        assignedByName: supervisor.full_name,
        assignedByEmail: supervisor.email
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task
    });
  } catch (error: any) {
    console.error('Error creating task:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/submit:
 *   post:
 *     summary: Submit a task solution
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:taskId/submit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.sub || req.user.id;

    // Get task
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get student's enrollment in this cohort
    const enrollment = await prisma.cohortStudent.findFirst({
      where: {
        cohortId: task.cohortId,
        studentId: userId,
        status: 'active'
      }
    });

    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this cohort' });
    }

    const {
      title,
      description,
      content,
      githubRepoUrl,
      githubPrUrl,
      githubBranch,
      commitHash,
      attachments
    } = req.body;

    // Validate required fields
    if (task.githubRequired && !githubRepoUrl) {
      return res.status(400).json({ error: 'GitHub repository URL is required for this task' });
    }

    if (task.prRequired && !githubPrUrl) {
      return res.status(400).json({ error: 'Pull request URL is required for this task' });
    }

    // Check daily PR submission quota
    const startOfDay = SubmissionQuotaService.getStartOfDayUTC();
    const countToday = await prisma.taskSubmission.count({
      where: {
        studentId: enrollment.id,
        submittedAt: { gte: startOfDay }
      }
    });

    const quota = SubmissionQuotaService.evaluateQuota(countToday);
    if (!quota.allowed) {
      return res.status(429).json({ error: quota.message, quota });
    }

    // Check if already submitted
    const existingSubmission = await prisma.taskSubmission.findFirst({
      where: {
        taskId,
        studentId: enrollment.id
      }
    });

    if (existingSubmission && existingSubmission.status !== 'draft') {
      return res.status(400).json({
        error: 'You have already submitted this task',
        submissionId: existingSubmission.id
      });
    }

    // Create or update submission
    const submission = existingSubmission
      ? await prisma.taskSubmission.update({
          where: { id: existingSubmission.id },
          data: {
            title,
            description,
            content,
            githubRepoUrl,
            githubPrUrl,
            githubBranch,
            commitHash,
            attachments: attachments || [],
            status: 'submitted',
            submittedAt: new Date()
          }
        })
      : await prisma.taskSubmission.create({
          data: {
            taskId,
            studentId: enrollment.id,
            title,
            description,
            content,
            githubRepoUrl,
            githubPrUrl,
            githubBranch,
            commitHash,
            attachments: attachments || [],
            status: 'submitted'
          }
        });

    // Award points for submission (base points, will be adjusted after review)
    const isOnTime = task.dueDate ? new Date() <= new Date(task.dueDate) : true;
    if (isOnTime) {
      await prisma.gamificationPoint.create({
        data: {
          studentId: enrollment.id,
          pointType: 'early_submission',
          points: 10,
          reason: `Submitted task "${task.title}" on time`,
          relatedTaskId: taskId
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Task submitted successfully',
      submission
    });
  } catch (error: any) {
    console.error('Error submitting task:', error);
    return res.status(500).json({ error: 'Failed to submit task' });
  }
});

/**
 * @swagger
 * /api/tasks/{taskId}/submissions:
 *   get:
 *     summary: Get all submissions for a task (Supervisor only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:taskId/submissions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can view all submissions' });
    }

    const submissions = await prisma.taskSubmission.findMany({
      where: { taskId },
      include: {
        student: {
          select: {
            studentName: true,
            studentEmail: true,
            studentId: true
          }
        },
        task: {
          select: {
            title: true,
            maxPoints: true,
            dueDate: true
          }
        }
      },
      orderBy: { submittedAt: 'desc' }
    });

    return res.json({ submissions });
  } catch (error: any) {
    console.error('Error fetching submissions:', error);
    return res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * @swagger
 * /api/tasks/submissions/{submissionId}/review:
 *   post:
 *     summary: Review and grade a task submission (Supervisor only)
 *     description: Approves or rejects an exercise PR submission, awards points to the intern, updates cohort leaderboard rank, and triggers email notification via Resend.
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *   patch:
 *     summary: Update review status and points for a task submission (Supervisor only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
const reviewHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { submissionId } = req.params;
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can review submissions' });
    }

    const { status, pointsEarned, feedback } = req.body;

    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      include: {
        task: true,
        student: true
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Validate points
    if (pointsEarned && pointsEarned > submission.task.maxPoints) {
      return res.status(400).json({
        error: `Points cannot exceed maximum of ${submission.task.maxPoints}`
      });
    }

    // Update submission
    const updated = await prisma.taskSubmission.update({
      where: { id: submissionId },
      data: {
        status,
        pointsEarned,
        feedback,
        reviewedBy: userId,
        reviewedAt: new Date()
      }
    });

    // Award gamification points if approved
    if (status === 'approved' && pointsEarned) {
      await prisma.gamificationPoint.create({
        data: {
          studentId: submission.studentId,
          pointType: 'task_completion',
          points: pointsEarned,
          reason: `Completed task "${submission.task.title}" - ${pointsEarned}/${submission.task.maxPoints} points`,
          relatedTaskId: submission.taskId
        }
      });
    }

    // Send email notification to intern on review decision
    if (submission.student?.studentEmail) {
      const isApproved = status === 'approved' || status === 'accepted';
      const isRejected = status === 'rejected';
      await sendTaskSubmissionEmail(
        submission.student.studentEmail,
        submission.student.studentName || 'Student',
        {
          prUrl: submission.githubPrUrl || '',
          branch: submission.githubBranch || '',
          module: submission.task.title,
          day: 1,
          domain: 'Cohort Task',
          status: isApproved ? 'accepted' : isRejected ? 'rejected' : 'pending',
          pointsAwarded: pointsEarned || undefined
        }
      ).catch(err => console.warn('Non-fatal review email dispatch error:', err));
    }

    return res.json({
      success: true,
      message: 'Submission reviewed successfully',
      submission: updated
    });
  } catch (error: any) {
    console.error('Error reviewing submission:', error);
    return res.status(500).json({ error: 'Failed to review submission' });
  }
};

router.post('/submissions/:submissionId/review', authMiddleware, reviewHandler);
router.patch('/submissions/:submissionId/review', authMiddleware, reviewHandler);

export default router;
