import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';

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
 *     summary: Review and grade a submission (Supervisor only)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/submissions/:submissionId/review', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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

    return res.json({
      success: true,
      message: 'Submission reviewed successfully',
      submission: updated
    });
  } catch (error: any) {
    console.error('Error reviewing submission:', error);
    return res.status(500).json({ error: 'Failed to review submission' });
  }
});

export default router;
