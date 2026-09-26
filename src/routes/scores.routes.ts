import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';
import { Resend } from 'resend';
import { env } from '../config/env';

const resend = new Resend(env.RESEND_API_KEY);
const router = Router();

/**
 * @swagger
 * /api/scores/my-scores:
 *   get:
 *     summary: Get weekly scores for authenticated student
 *     tags: [Scores]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my-scores', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;

    // Get student enrollments
    const enrollments = await prisma.cohortStudent.findMany({
      where: { studentId: userId },
      select: { id: true }
    });

    if (enrollments.length === 0) {
      return res.json({ scores: [] });
    }

    const scores = await prisma.weeklyScore.findMany({
      where: {
        studentId: { in: enrollments.map(e => e.id) }
      },
      orderBy: { weekNumber: 'desc' },
      take: 12 // Last 12 weeks
    });

    return res.json({ scores });
  } catch (error: any) {
    console.error('Error fetching scores:', error);
    return res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

/**
 * @swagger
 * /api/scores/calculate:
 *   post:
 *     summary: Calculate and generate weekly scores (Cron job or Supervisor)
 *     tags: [Scores]
 *     security:
 *       - bearerAuth: []
 */
router.post('/calculate', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can calculate scores' });
    }

    const { cohortId, weekNumber } = req.body;

    // Get all active students in cohort
    const students = await prisma.cohortStudent.findMany({
      where: {
        cohortId,
        status: 'active'
      },
      include: {
        tasksSubmitted: {
          include: {
            task: true
          }
        },
        gamificationPoints: true
      }
    });

    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - 7);
    const weekEndDate = new Date();

    const scores = [];

    for (const student of students) {
      // Filter tasks and points for this week
      const weekTasks = student.tasksSubmitted.filter(
        ts => ts.submittedAt >= weekStartDate && ts.submittedAt <= weekEndDate
      );

      const weekPoints = student.gamificationPoints.filter(
        gp => gp.awardedAt >= weekStartDate && gp.awardedAt <= weekEndDate
      );

      // Calculate metrics
      const tasksCompleted = weekTasks.filter(t => t.status === 'approved').length;
      const tasksOnTime = weekTasks.filter(t => {
        const task = t.task;
        return task.dueDate && t.submittedAt <= task.dueDate;
      }).length;

      const totalPoints = weekPoints.reduce((sum, gp) => sum + gp.points, 0);

      // Calculate overall score (0-100)
      const overallScore = calculateOverallScore({
        tasksCompleted,
        tasksOnTime,
        totalPoints,
        expectedTasks: 5 // Could be dynamic based on cohort
      });

      // Generate AI analysis
      const aiAnalysis = await generateAIAnalysis(student, weekTasks, totalPoints);

      // Create weekly score
      const score = await prisma.weeklyScore.create({
        data: {
          studentId: student.id,
          cohortId,
          weekNumber,
          tasksCompleted,
          tasksOnTime,
          totalPoints,
          overallScore,
          aiAnalysis: aiAnalysis.analysis,
          strengths: aiAnalysis.strengths,
          improvements: aiAnalysis.improvements,
          weekStartDate,
          weekEndDate,
          emailSent: false
        }
      });

      scores.push(score);
    }

    return res.status(201).json({
      success: true,
      message: `Calculated scores for ${scores.length} students`,
      scores
    });
  } catch (error: any) {
    console.error('Error calculating scores:', error);
    return res.status(500).json({ error: 'Failed to calculate scores' });
  }
});

/**
 * @swagger
 * /api/scores/send-weekly-emails:
 *   post:
 *     summary: Send weekly score emails to all students
 *     tags: [Scores]
 *     security:
 *       - bearerAuth: []
 */
router.post('/send-weekly-emails', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can trigger emails' });
    }

    const { cohortId, weekNumber } = req.body;

    // Get scores that haven't been emailed yet
    const scores = await prisma.weeklyScore.findMany({
      where: {
        cohortId,
        weekNumber,
        emailSent: false
      },
      include: {
        student: true
      }
    });

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const score of scores) {
      try {
        const emailHtml = generateWeeklyScoreEmail(score);

        await resend.emails.send({
          from: env.EMAIL_FROM,
          to: score.student.studentEmail,
          subject: `Your Week ${weekNumber} Performance Report - Zigex`,
          html: emailHtml
        });

        // Mark as sent
        await prisma.weeklyScore.update({
          where: { id: score.id },
          data: {
            emailSent: true,
            emailSentAt: new Date()
          }
        });

        emailsSent++;
      } catch (emailError) {
        console.error(`Failed to send email to ${score.student.studentEmail}:`, emailError);
        emailsFailed++;
      }
    }

    return res.json({
      success: true,
      message: `Sent ${emailsSent} emails, ${emailsFailed} failed`,
      emailsSent,
      emailsFailed
    });
  } catch (error: any) {
    console.error('Error sending weekly emails:', error);
    return res.status(500).json({ error: 'Failed to send emails' });
  }
});

// Helper function to calculate overall score
function calculateOverallScore(metrics: {
  tasksCompleted: number;
  tasksOnTime: number;
  totalPoints: number;
  expectedTasks: number;
}): number {
  const { tasksCompleted, tasksOnTime, totalPoints, expectedTasks } = metrics;

  // Weighted scoring
  const completionRate = (tasksCompleted / expectedTasks) * 40; // 40% weight
  const punctualityRate = tasksOnTime > 0 ? (tasksOnTime / tasksCompleted) * 30 : 0; // 30% weight
  const pointsScore = Math.min((totalPoints / 100) * 30, 30); // 30% weight, capped

  return Math.min(Math.round(completionRate + punctualityRate + pointsScore), 100);
}

// Helper function to generate AI analysis
async function generateAIAnalysis(
  student: any,
  weekTasks: any[],
  totalPoints: number
): Promise<{
  analysis: string;
  strengths: string[];
  improvements: string[];
}> {
  // TODO: Integrate with actual AI service (OpenAI, Anthropic, etc.)
  // For now, generate rule-based analysis

  const strengths: string[] = [];
  const improvements: string[] = [];

  // Analyze completion rate
  if (weekTasks.length >= 4) {
    strengths.push('Consistent task completion');
  } else if (weekTasks.length < 2) {
    improvements.push('Increase task completion rate');
  }

  // Analyze timeliness
  const onTimeTasks = weekTasks.filter(t =>
    t.task.dueDate && t.submittedAt <= t.task.dueDate
  );
  if (onTimeTasks.length === weekTasks.length && weekTasks.length > 0) {
    strengths.push('Excellent time management');
  } else if (onTimeTasks.length < weekTasks.length / 2) {
    improvements.push('Work on meeting deadlines');
  }

  // Analyze points
  if (totalPoints > 80) {
    strengths.push('High quality submissions');
  } else if (totalPoints < 40) {
    improvements.push('Focus on code quality and thoroughness');
  }

  const analysis = `This week you completed ${weekTasks.length} tasks and earned ${totalPoints} points. ${
    strengths.length > 0 ? 'Your strengths include: ' + strengths.join(', ') + '. ' : ''
  }${
    improvements.length > 0 ? 'Areas for improvement: ' + improvements.join(', ') + '.' : ''
  }`;

  return { analysis, strengths, improvements };
}

// Helper function to generate email HTML
function generateWeeklyScoreEmail(score: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .score-card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .score-value { font-size: 48px; font-weight: bold; color: #667eea; text-align: center; }
        .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .strengths { background: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .improvements { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Weekly Performance Report</h1>
          <p>Week ${score.weekNumber} - ${score.student.studentName}</p>
        </div>
        <div class="content">
          <div class="score-card">
            <h2 style="text-align: center; margin-bottom: 10px;">Overall Score</h2>
            <div class="score-value">${score.overallScore}%</div>
          </div>

          <div class="score-card">
            <h3>📊 This Week's Metrics</h3>
            <div class="metric">
              <span>Tasks Completed</span>
              <strong>${score.tasksCompleted}</strong>
            </div>
            <div class="metric">
              <span>Tasks On Time</span>
              <strong>${score.tasksOnTime}</strong>
            </div>
            <div class="metric">
              <span>Total Points Earned</span>
              <strong>${score.totalPoints}</strong>
            </div>
          </div>

          ${score.strengths.length > 0 ? `
          <div class="strengths">
            <h3>💪 Your Strengths</h3>
            <ul>
              ${score.strengths.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          ${score.improvements.length > 0 ? `
          <div class="improvements">
            <h3>📈 Areas for Growth</h3>
            <ul>
              ${score.improvements.map((i: string) => `<li>${i}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="score-card">
            <h3>🤖 AI Analysis</h3>
            <p>${score.aiAnalysis}</p>
          </div>
        </div>
        <div class="footer">
          <p>Keep up the great work! 🚀</p>
          <p>This is an automated report from Zigex Internship Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export default router;
