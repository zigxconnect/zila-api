/**
 * Task and Pull Request Submission Quota Service
 * Enforces cohort policy: One PR a day recommended, maximum 2 PRs allowed per calendar day.
 */

export interface QuotaCheckResult {
  allowed: boolean;
  countToday: number;
  remainingToday: number;
  maxDaily: number;
  message: string;
}

export class SubmissionQuotaService {
  public static readonly MAX_DAILY_PRS = 2;
  public static readonly RECOMMENDED_DAILY_PRS = 1;

  /**
   * Calculates start of current day in UTC
   */
  static getStartOfDayUTC(date: Date = new Date()): Date {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  /**
   * Verifies if a student can make another pull request submission today
   */
  static evaluateQuota(submissionsToday: number): QuotaCheckResult {
    const remaining = Math.max(0, this.MAX_DAILY_PRS - submissionsToday);
    const allowed = submissionsToday < this.MAX_DAILY_PRS;

    let message = "";
    if (!allowed) {
      message = `Daily PR submission quota reached (${this.MAX_DAILY_PRS}/${this.MAX_DAILY_PRS}). You cannot submit more than 2 PRs per day. Please continue tomorrow!`;
    } else if (submissionsToday === 1) {
      message = `You have made 1 PR today (1/${this.MAX_DAILY_PRS}). Recommended is 1 PR a day, but 1 final submission is still allowed today.`;
    } else {
      message = `Daily quota available: ${remaining}/${this.MAX_DAILY_PRS} PR submissions remaining today.`;
    }

    return {
      allowed,
      countToday: submissionsToday,
      remainingToday: remaining,
      maxDaily: this.MAX_DAILY_PRS,
      message,
    };
  }
}
