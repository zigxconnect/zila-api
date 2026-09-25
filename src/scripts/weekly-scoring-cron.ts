import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Resend } from 'resend';
import { env } from '../config/env.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
const resend = new Resend(env.RESEND_API_KEY);

interface ScoreMetrics {
  tasksCompleted: number;
  tasksOnTime: number;
  totalPoints: number;
  expectedTasks: number;
}

interface AIAnalysis {
  analysis: string;
  strengths: string[];
  improvements: string[];
}

async function calculateWeeklyScores() {
  console.log('📊 Calculating weekly scores...\n');

  const now = new Date();
  const currentWeekNumber = Math.ceil(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - 7);
  weekStartDate.setHours(0, 0, 0, 0);

  const weekEndDate = new Date(now);
  weekEndDate.setHours(23, 59, 59, 999);

  // Get all active cohorts
  const cohorts = await prisma.cohort.findMany({
    where: {
      isActive: true,
      students: {
        some: {
          status: 'active'
        }
      }
    },
    include: {
      students: {
        where: { status: 'active' },
        include: {
          tasksSubmitted: {
            where: {
              submittedAt: {
                gte: weekStartDate,
                lte: weekEndDate
              }
            },
            include: {
              task: true
            }
          },
          gamificationPoints: {
            where: {
              awardedAt: {
                gte: weekStartDate,
                lte: weekEndDate
              }
            }
          }
        }
      }
    }
  });

  let totalScoresCalculated = 0;

  for (const cohort of cohorts) {
    console.log(`📚 Processing cohort: ${cohort.name}`);

    for (const student of cohort.students) {
      try {
        // Check if score already exists for this week
        const existingScore = await prisma.weeklyScore.findUnique({
          where: {
            studentId_weekNumber: {
              studentId: student.id,
              weekNumber: currentWeekNumber
            }
          }
        });

        if (existingScore) {
          console.log(`   ⏭️  Skipping ${student.studentName} (already calculated)`);
          continue;
        }

        // Calculate metrics
        const weekTasks = student.tasksSubmitted;
        const weekPoints = student.gamificationPoints;

        const tasksCompleted = weekTasks.filter(t => t.status === 'approved').length;
        const tasksOnTime = weekTasks.filter(t => {
          const task = t.task;
          return task.dueDate && t.submittedAt <= task.dueDate;
        }).length;

        const totalPoints = weekPoints.reduce((sum, gp) => sum + gp.points, 0);

        // Calculate overall score
        const metrics: ScoreMetrics = {
          tasksCompleted,
          tasksOnTime,
          totalPoints,
          expectedTasks: 5
        };

        const overallScore = calculateOverallScore(metrics);

        // Generate AI analysis
        const aiAnalysis = await generateAIAnalysis(student, weekTasks, totalPoints);

        // Create weekly score
        await prisma.weeklyScore.create({
          data: {
            studentId: student.id,
            cohortId: cohort.id,
            weekNumber: currentWeekNumber,
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

        console.log(`   ✅ Calculated for ${student.studentName}: ${overallScore}%`);
        totalScoresCalculated++;

      } catch (error) {
        console.error(`   ❌ Error calculating for ${student.studentName}:`, error);
      }
    }
  }

  console.log(`\n✨ Calculation complete! Processed ${totalScoresCalculated} students.`);
}

async function sendWeeklyEmails() {
  console.log('\n📧 Sending weekly score emails...\n');

  const scores = await prisma.weeklyScore.findMany({
    where: {
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
        subject: `Your Week ${score.weekNumber} Performance Report - Zigex 🚀`,
        html: emailHtml
      });

      await prisma.weeklyScore.update({
        where: { id: score.id },
        data: {
          emailSent: true,
          emailSentAt: new Date()
        }
      });

      console.log(`   ✅ Sent to ${score.student.studentEmail}`);
      emailsSent++;

    } catch (error) {
      console.error(`   ❌ Failed to send to ${score.student.studentEmail}:`, error);
      emailsFailed++;
    }
  }

  console.log(`\n✨ Email sending complete!`);
  console.log(`   Sent: ${emailsSent}`);
  console.log(`   Failed: ${emailsFailed}`);
}

function calculateOverallScore(metrics: ScoreMetrics): number {
  const { tasksCompleted, tasksOnTime, totalPoints, expectedTasks } = metrics;

  const completionRate = (tasksCompleted / expectedTasks) * 40;
  const punctualityRate = tasksOnTime > 0 ? (tasksOnTime / tasksCompleted) * 30 : 0;
  const pointsScore = Math.min((totalPoints / 100) * 30, 30);

  return Math.min(Math.round(completionRate + punctualityRate + pointsScore), 100);
}

async function generateAIAnalysis(
  student: any,
  weekTasks: any[],
  totalPoints: number
): Promise<AIAnalysis> {
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (weekTasks.length >= 4) {
    strengths.push('Consistent task completion');
  } else if (weekTasks.length < 2) {
    improvements.push('Increase task completion rate');
  }

  const onTimeTasks = weekTasks.filter(t =>
    t.task.dueDate && t.submittedAt <= t.task.dueDate
  );

  if (onTimeTasks.length === weekTasks.length && weekTasks.length > 0) {
    strengths.push('Excellent time management');
  } else if (onTimeTasks.length < weekTasks.length / 2) {
    improvements.push('Work on meeting deadlines');
  }

  if (totalPoints > 80) {
    strengths.push('High quality submissions');
  } else if (totalPoints < 40) {
    improvements.push('Focus on code quality and thoroughness');
  }

  const analysis = `This week you completed ${weekTasks.length} tasks and earned ${totalPoints} points. ${
    strengths.length > 0 ? 'Your strengths include: ' + strengths.join(', ') + '. ' : ''
  }${
    improvements.length > 0 ? 'Areas for improvement: ' + improvements.join(', ') + '.' : 'Keep up the great work!'
  }`;

  return { analysis, strengths, improvements };
}

function generateWeeklyScoreEmail(score: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
        .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
        .content { padding: 40px 30px; }
        .score-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; margin: 0 0 30px; border-radius: 12px; text-align: center; }
        .score-value { font-size: 56px; font-weight: 800; margin: 10px 0; }
        .metric-card { background: #f8f9fa; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #667eea; }
        .metric { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e9ecef; }
        .metric:last-child { border-bottom: none; }
        .metric strong { color: #667eea; font-weight: 600; }
        .strengths { background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745; }
        .improvements { background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
        .section-title { font-size: 18px; font-weight: 600; margin: 0 0 15px; color: #333; }
        ul { margin: 10px 0; padding-left: 20px; }
        li { margin: 8px 0; }
        .footer { background: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
        .footer strong { color: #333; }
        .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; margin: 20px 0; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 Weekly Performance Report</h1>
          <p>Week ${score.weekNumber} • ${score.student.studentName}</p>
        </div>
        <div class="content">
          <div class="score-card">
            <div style="font-size: 16px; opacity: 0.9; margin-bottom: 5px;">Your Overall Score</div>
            <div class="score-value">${score.overallScore}%</div>
            <div style="font-size: 14px; opacity: 0.8; margin-top: 5px;">${getScoreMessage(score.overallScore)}</div>
          </div>

          <div class="metric-card">
            <h3 class="section-title">📊 This Week's Metrics</h3>
            <div class="metric">
              <span>Tasks Completed</span>
              <strong>${score.tasksCompleted}</strong>
            </div>
            <div class="metric">
              <span>Tasks Submitted On Time</span>
              <strong>${score.tasksOnTime}</strong>
            </div>
            <div class="metric">
              <span>Total Points Earned</span>
              <strong>${score.totalPoints}</strong>
            </div>
          </div>

          ${score.strengths.length > 0 ? `
          <div class="strengths">
            <h3 class="section-title">💪 Your Strengths</h3>
            <ul>
              ${score.strengths.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          ${score.improvements.length > 0 ? `
          <div class="improvements">
            <h3 class="section-title">📈 Areas for Growth</h3>
            <ul>
              ${score.improvements.map((i: string) => `<li>${i}</li>`).join('')}
            </ul>
          </div>
          ` : ''}

          <div class="metric-card">
            <h3 class="section-title">🤖 AI Analysis</h3>
            <p style="margin: 0; line-height: 1.8;">${score.aiAnalysis}</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #6c757d; margin-bottom: 15px;">Keep pushing forward! 🚀</p>
          </div>
        </div>
        <div class="footer">
          <p><strong>Zigex Internship Platform</strong></p>
          <p>This is an automated weekly report. Keep up the great work!</p>
          <p style="margin-top: 15px; font-size: 12px;">Use <code>zila stats</code> in your terminal to view detailed progress.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getScoreMessage(score: number): string {
  if (score >= 90) return 'Outstanding Performance! 🌟';
  if (score >= 80) return 'Excellent Work! 🎉';
  if (score >= 70) return 'Great Job! 👏';
  if (score >= 60) return 'Good Progress! 📈';
  return 'Keep Working Hard! 💪';
}

// Main execution
async function main() {
  try {
    await calculateWeeklyScores();
    await sendWeeklyEmails();
  } catch (error) {
    console.error('❌ Cron job failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✅ Weekly scoring job completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
