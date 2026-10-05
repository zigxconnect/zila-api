import { prisma, withDbRetry } from '../config/prisma';
import { sendTaskSubmissionEmail } from './email.service';

export interface GitHubPullResponse {
  state: 'open' | 'closed';
  merged: boolean;
  merged_at: string | null;
  closed_at: string | null;
  html_url: string;
}

export class GitHubPrSyncService {
  /**
   * Parse owner, repo, and PR number from a pull request URL
   * e.g. https://github.com/iws3/sample_repo_zila/pull/42
   */
  static parsePrUrl(url?: string | null): { owner: string; repo: string; pullNumber: number } | null {
    if (!url) return null;
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
    if (!match) return null;
    return {
      owner: match[1]!,
      repo: match[2]!.replace(/\.git$/i, ''),
      pullNumber: parseInt(match[3]!, 10),
    };
  }

  /**
   * Fetch current PR state from GitHub REST API
   */
  static async fetchPrState(owner: string, repo: string, pullNumber: number): Promise<GitHubPullResponse | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Zigex-Zila-Automation/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        headers,
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as any;
      return {
        state: data.state,
        merged: Boolean(data.merged || data.merged_at),
        merged_at: data.merged_at,
        closed_at: data.closed_at,
        html_url: data.html_url,
      };
    } catch (err: any) {
      console.warn(`[GitHubPrSyncService] Failed to fetch PR ${owner}/${repo}#${pullNumber}:`, err.message);
      return null;
    }
  }

  /**
   * Check and synchronize pending PR submissions for a cohort or specific student
   */
  static async syncPendingSubmissions(cohortId?: string): Promise<number> {
    try {
      const pendingSubmissions = await withDbRetry(() =>
        prisma.taskSubmission.findMany({
          where: {
            status: 'submitted',
            ...(cohortId && {
              task: { cohortId },
            }),
          },
          include: {
            task: true,
            student: true,
          },
          take: 15,
        })
      );

      let updatedCount = 0;

      for (const sub of pendingSubmissions) {
        const parsed = this.parsePrUrl(sub.githubPrUrl);
        if (!parsed) continue;

        const ghState = await this.fetchPrState(parsed.owner, parsed.repo, parsed.pullNumber);
        if (!ghState) continue;

        if (ghState.merged) {
          // PR WAS MERGED ON GITHUB!
          const pointsToAward = sub.task.maxPoints || 25;

          await withDbRetry(() =>
            prisma.taskSubmission.update({
              where: { id: sub.id },
              data: {
                status: 'approved',
                pointsEarned: pointsToAward,
                feedback: 'Pull request successfully merged into cohort repository.',
                reviewedAt: new Date(ghState.merged_at || Date.now()),
              },
            })
          );

          // Award gamification points to adjust leaderboard
          await withDbRetry(() =>
            prisma.gamificationPoint.create({
              data: {
                studentId: sub.studentId,
                pointType: 'task_completion',
                points: pointsToAward,
                reason: `PR merged for "${sub.task.title}"`,
                relatedTaskId: sub.taskId,
              },
            })
          );

          // Dispatch confirmation email to intern
          if (sub.student?.studentEmail) {
            await sendTaskSubmissionEmail(sub.student.studentEmail, sub.student.studentName || 'Student', {
              prUrl: sub.githubPrUrl || ghState.html_url,
              branch: sub.githubBranch || 'main',
              module: sub.task.title,
              day: 1,
              domain: 'Cohort Task',
              status: 'accepted',
              pointsAwarded: pointsToAward,
            }).catch((err) => console.warn('Non-fatal email send error:', err));
          }

          updatedCount++;
        } else if (ghState.state === 'closed' && !ghState.merged) {
          // PR was closed without merge
          await withDbRetry(() =>
            prisma.taskSubmission.update({
              where: { id: sub.id },
              data: {
                status: 'rejected',
                feedback: 'Pull request was closed without merge.',
                reviewedAt: new Date(ghState.closed_at || Date.now()),
              },
            })
          );

          if (sub.student?.studentEmail) {
            await sendTaskSubmissionEmail(sub.student.studentEmail, sub.student.studentName || 'Student', {
              prUrl: sub.githubPrUrl || ghState.html_url,
              branch: sub.githubBranch || 'main',
              module: sub.task.title,
              day: 1,
              domain: 'Cohort Task',
              status: 'rejected',
            }).catch((err) => console.warn('Non-fatal email send error:', err));
          }

          updatedCount++;
        }
      }

      return updatedCount;
    } catch (err: any) {
      console.warn('[GitHubPrSyncService] Error syncing submissions:', err.message);
      return 0;
    }
  }
}
