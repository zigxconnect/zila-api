import { prisma } from "../config/prisma.js";

export interface QuotaEvaluationResult {
  allowed: boolean;
  freeTasksUsed: number;
  freeTasksMax: number;
  hasPaid: boolean;
  message?: string;
  checkoutUrl?: string;
}

export class BillingQuotaService {
  private static readonly FREE_TASKS_LIMIT = 6;

  /**
   * Evaluates if a student in a specific cohort has remaining submission quota.
   */
  static async checkStudentSubmissionQuota(
    studentId: string,
    cohortId: string,
  ): Promise<QuotaEvaluationResult> {
    const student = await prisma.cohortStudent.findFirst({
      where: {
        studentId,
        cohortId,
      },
      include: {
        tasksSubmitted: true,
      },
    });

    if (!student) {
      return {
        allowed: false,
        freeTasksUsed: 0,
        freeTasksMax: this.FREE_TASKS_LIMIT,
        hasPaid: false,
        message: "Student enrollment not found in active cohort.",
      };
    }

    // Check payment status (from admin record or cohortStudent flag)
    const hasPaid = (student as any).hasPaid ?? false;
    const count = student.tasksSubmitted.length;

    if (hasPaid) {
      return {
        allowed: true,
        freeTasksUsed: count,
        freeTasksMax: this.FREE_TASKS_LIMIT,
        hasPaid: true,
        message: "Tuition verified: unlimited evaluations active.",
      };
    }

    if (count < this.FREE_TASKS_LIMIT) {
      return {
        allowed: true,
        freeTasksUsed: count,
        freeTasksMax: this.FREE_TASKS_LIMIT,
        hasPaid: false,
        message: `Complimentary trial: ${count} of ${this.FREE_TASKS_LIMIT} free evaluations completed.`,
      };
    }

    return {
      allowed: false,
      freeTasksUsed: count,
      freeTasksMax: this.FREE_TASKS_LIMIT,
      hasPaid: false,
      message: `Evaluation paused: Free trial quota exceeded (${this.FREE_TASKS_LIMIT}/${this.FREE_TASKS_LIMIT}). Please pay tuition to proceed.`,
      checkoutUrl: `https://zigex.com/checkout?studentId=${studentId}&cohortId=${cohortId}`,
    };
  }

  /**
   * Calculates post-deadline penalty revenue split: 90% Zigex, 10% Host Company
   */
  static calculatePenaltyDistribution(
    penaltyAmount: number,
    companyId: string,
  ): {
    total: number;
    zigexShare: number;
    companyShare: number;
    companyId: string;
  } {
    const zigexShare = Math.round(penaltyAmount * 0.9 * 100) / 100;
    const companyShare = Math.round(penaltyAmount * 0.1 * 100) / 100;

    return {
      total: penaltyAmount,
      zigexShare,
      companyShare,
      companyId,
    };
  }
}
