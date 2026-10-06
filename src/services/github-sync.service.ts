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

  static async fetchPrState(
    owner: string,
    repo: string,
    pullNumber: number,
    token?: string,
  ): Promise<GitHubPullResponse | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Zigex-Zila-Automation/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      const authToken = token || process.env.GITHUB_TOKEN;
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
        { headers },
      );
      if (!res.ok) {
        console.warn(`[GitHubPrSyncService] GitHub API ${res.status} for PR #${pullNumber}`);
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
   * Check if ANY merged PR exists on the same branch (detects when PR#5 merged
   * but submission still references the newer open PR#6 on the same branch).
   */
  static async findMergedPrOnBranch(
    owner: string,
    repo: string,
    branchName: string,
    token?: string,
  ): Promise<GitHubPullResponse | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Zigex-Zila-Automation/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      const authToken = token || process.env.GITHUB_TOKEN;
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(branchName)}&state=all`;
      const res = await fetch(url, { headers });
      if (!res.ok) return null;

      const pulls = (await res.json()) as any[];
      const merged = pulls.find((p: any) => p.merged_at !== null);
      if (merged) {
        return {
          state: 'closed',
          merged: true,
          merged_at: merged.merged_at,
          closed_at: merged.merged_at,
          html_url: merged.html_url,
        };
      }
      return null;
    } catch (err: any) {
      console.warn(`[GitHubPrSyncService] Failed branch lookup ${owner}/${repo}@${branchName}:`, err.message);
      return null;
    }
  }

  /**
   * Sync all pending PR submissions globally (no cohortId filter).
   * Points stored against CohortStudent.id so the leaderboard can aggregate
   * across cohorts for a given user.
   */
  static async syncPendingSubmissions(cohortId?: string, githubToken?: string): Promise<number> {
    try {
      const pendingSubmissions = await withDbRetry(() =>
        prisma.taskSubmission.findMany({
          where: { status: 'submitted' },
          include: { task: true, student: true },
          take: 30,
        }),
      );

      let updatedCount = 0;

      for (const sub of pendingSubmissions) {
        const parsed = this.parsePrUrl(sub.githubPrUrl);
        if (!parsed) continue;

        let ghState = await this.fetchPrState(parsed.owner, parsed.repo, parsed.pullNumber, githubToken);

        // If linked PR still open, check for a merged PR on the same branch
        if (ghState && !ghState.merged && sub.githubBranch) {
          const branchMerged = await this.findMergedPrOnBranch(
            parsed.owner, parsed.repo, sub.githubBranch, githubToken,
          );
          if (branchMerged) {
            ghState = branchMerged;
            // Correct the stored PR URL to the actual merged one
            await withDbRetry(() =>
              prisma.taskSubmission.update({
                where: { id: sub.id },
                data: { githubPrUrl: branchMerged.html_url },
              }),
            );
          }
        }

        if (!ghState) continue;

        const pointsToAward = sub.task.maxPoints && sub.task.maxPoints <= 4 ? sub.task.maxPoints : 1;

        if (ghState.merged) {
          // Duplicate guard — prevents double-awarding merge bonus
          const existingMergePoint = await prisma.gamificationPoint.findFirst({
            where: {
              studentId: sub.student.id,
              relatedTaskId: sub.taskId,
              pointType: 'task_completion_merge',
            },
          });

          // Always update submission to approved
          if (sub.status === 'submitted') {
            await withDbRetry(() =>
              prisma.taskSubmission.update({
                where: { id: sub.id },
                data: {
                  status: 'approved',
                  pointsEarned: pointsToAward,
                  feedback: 'Pull request successfully merged into cohort repository.',
                  reviewedAt: new Date(ghState!.merged_at || Date.now()),
                },
              }),
            );
          }

          if (!existingMergePoint) {
            // Award merge bonus points (CohortStudent.id for the relation)
            await withDbRetry(() =>
              prisma.gamificationPoint.create({
                data: {
                  studentId: sub.student.id,
                  pointType: 'task_completion_merge',
                  points: pointsToAward,
                  reason: `PR merged for "${sub.task.title}"`,
                  relatedTaskId: sub.taskId,
                },
              }),
            );

            // Send accepted email
            if (sub.student?.studentEmail) {
              await sendTaskSubmissionEmail(
                sub.student.studentEmail,
                sub.student.studentName || 'Student',
                {
                  prUrl: ghState.html_url,
                  branch: sub.githubBranch || 'main',
                  module: sub.task.title,
                  day: 1,
                  domain: 'Cohort Task',
                  status: 'accepted',
                  pointsAwarded: pointsToAward,
                },
              ).catch((e) => console.warn('Non-fatal email send error:', e));
            }
          }

          updatedCount++;
        } else if (ghState.state === 'closed' && !ghState.merged) {
          await withDbRetry(() =>
            prisma.taskSubmission.update({
              where: { id: sub.id },
              data: {
                status: 'rejected',
                feedback: 'Pull request was closed without merge.',
                reviewedAt: new Date(ghState!.closed_at || Date.now()),
              },
            }),
          );

          if (sub.student?.studentEmail) {
            await sendTaskSubmissionEmail(
              sub.student.studentEmail,
              sub.student.studentName || 'Student',
              {
                prUrl: sub.githubPrUrl || ghState.html_url,
                branch: sub.githubBranch || 'main',
                module: sub.task.title,
                day: 1,
                domain: 'Cohort Task',
                status: 'rejected',
              },
            ).catch((e) => console.warn('Non-fatal email send error:', e));
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
