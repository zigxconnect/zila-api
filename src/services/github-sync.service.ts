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

  static parseRepoUrl(url?: string | null): { owner: string; repo: string } | null {
    if (!url) return null;
    const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/|$)/i);
    if (!match) return null;
    return {
      owner: match[1]!,
      repo: match[2]!.replace(/\.git$/i, ''),
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
   * Check if a merged PR exists on the same branch that was merged around or after minDate.
   */
  static async findMergedPrOnBranch(
    owner: string,
    repo: string,
    branchName: string,
    token?: string,
    minDate?: Date,
  ): Promise<GitHubPullResponse | null> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Zigex-Zila-Automation/1.0',
        Accept: 'application/vnd.github.v3+json',
      };
      const authToken = token || process.env.GITHUB_TOKEN;
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner)}:${encodeURIComponent(branchName)}&state=all&sort=updated&direction=desc`;
      const res = await fetch(url, { headers });
      if (!res.ok) return null;

      const pulls = (await res.json()) as any[];
      if (!Array.isArray(pulls)) return null;

      const mergedPulls = pulls.filter((p: any) => {
        if (!p.merged_at) return false;
        if (minDate) {
          const mergedTime = new Date(p.merged_at).getTime();
          const threshold = minDate.getTime() - 5 * 60 * 1000; // 5 minute grace buffer
          return mergedTime >= threshold;
        }
        return true;
      });

      mergedPulls.sort((a: any, b: any) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime());

      const latestMerged = mergedPulls[0];
      if (latestMerged) {
        return {
          state: 'closed',
          merged: true,
          merged_at: latestMerged.merged_at,
          closed_at: latestMerged.merged_at,
          html_url: latestMerged.html_url,
        };
      }
      return null;
    } catch (err: any) {
      console.warn(`[GitHubPrSyncService] Failed branch lookup ${owner}/${repo}@${branchName}:`, err.message);
      return null;
    }
  }

  /**
   * Sync all pending PR submissions globally or for a specific cohort.
   * Points stored against CohortStudent.id so the leaderboard isolates
   * across cohorts for a given user.
   */
  static async syncPendingSubmissions(cohortId?: string, githubToken?: string): Promise<number> {
    try {
      const pendingSubmissions = await withDbRetry(() =>
        prisma.taskSubmission.findMany({
          where: {
            status: 'submitted',
            ...(cohortId && { task: { cohortId } }),
          },
          include: { task: true, student: true },
          take: 30,
        }),
      );

      let updatedCount = 0;

      for (const sub of pendingSubmissions) {
        const parsed = this.parsePrUrl(sub.githubPrUrl) || this.parseRepoUrl(sub.githubRepoUrl);
        if (!parsed) continue;

        let ghState: GitHubPullResponse | null = null;
        const hasExplicitPrNumber = 'pullNumber' in parsed && typeof (parsed as any).pullNumber === 'number';

        if (hasExplicitPrNumber) {
          ghState = await this.fetchPrState(parsed.owner, parsed.repo, (parsed as any).pullNumber, githubToken);
        }

        // If explicitly submitted PR is still OPEN, do NOT hijack it with older merged PRs on the branch!
        if (ghState && ghState.state === 'open' && !ghState.merged) {
          continue;
        }

        // Only search branch if:
        // 1. No explicit PR number was provided, OR
        // 2. The explicit PR was closed without merge and a newer merged PR was created on the same branch
        if ((!ghState || (ghState.state === 'closed' && !ghState.merged)) && sub.githubBranch) {
          const branchMerged = await this.findMergedPrOnBranch(
            parsed.owner,
            parsed.repo,
            sub.githubBranch,
            githubToken,
            sub.submittedAt,
          );
          if (branchMerged) {
            ghState = branchMerged;
            await withDbRetry(() =>
              prisma.taskSubmission.update({
                where: { id: sub.id },
                data: { githubPrUrl: branchMerged.html_url },
              }),
            );
          }
        }

        if (!ghState) continue;

        // If still open after all checks, keep submission in 'submitted' status
        if (ghState.state === 'open' && !ghState.merged) {
          continue;
        }

        const pointsToAward = sub.task.maxPoints && sub.task.maxPoints <= 4 ? sub.task.maxPoints : 1;

        if (ghState.merged) {
          const prNumberMatch = ghState.html_url.match(/\/pull\/(\d+)/);
          const prNum = prNumberMatch ? prNumberMatch[1] : null;

          // Duplicate guard — checks if this specific PR has already awarded merge points to this student
          const existingMergePoint = await prisma.gamificationPoint.findFirst({
            where: {
              studentId: sub.student.id,
              pointType: 'task_completion_merge',
              OR: [
                { reason: { contains: ghState.html_url } },
                ...(prNum ? [{ reason: { contains: `PR #${prNum}` } }] : []),
              ],
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
                  reason: `PR #${prNum || 'merged'} merged for "${sub.task.title}" (${ghState.html_url})`,
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
