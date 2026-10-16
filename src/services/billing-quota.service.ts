import { prisma } from "../config/prisma.js";
import { supabase } from "../config/supabase.js";

export interface QuotaEvaluationResult {
  allowed: boolean;
  freeTasksUsed: number;
  freeTasksMax: number;
  hasPaid: boolean;
  message?: string;
  checkoutUrl?: string;
}

export class BillingQuotaService {
  public static readonly FREE_TASKS_LIMIT = 5;

  /**
   * Evaluates if a student in a specific cohort has remaining submission quota.
   * Checks the live payment toggle from the Zigex Admin / Interns Ledger tab.
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

    // 1. Check live payment status from Supabase Applications table (toggled in Admin Interns Ledger)
    let hasPaid = (student as any).hasPaid ?? false;
    try {
      const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
      const refId = cohort?.programId;

      // Check profile ID from student_profiles
      const { data: profile } = await supabase
        .from('student_profiles')
        .select('id')
        .or(`user_id.eq.${studentId},id.eq.${studentId}`)
        .maybeSingle();

      const profileId = profile?.id || studentId;

      let query = supabase
        .from('Applications')
        .select('is_paid, payment_completed, status')
        .eq('student_id', profileId);

      if (refId) {
        query = query.or(`internship_id.eq.${refId},program_id.eq.${refId}`);
      }

      const { data: appData } = await query.maybeSingle();
      if (appData) {
        hasPaid = Boolean(appData.payment_completed || appData.is_paid);
      }
    } catch (err) {
      // Non-fatal, fallback to local hasPaid
    }

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
      message: `Evaluation paused: Free trial quota exceeded (${this.FREE_TASKS_LIMIT}/${this.FREE_TASKS_LIMIT} tasks used). Payment status for this program is UNPAID in the internship ledger. Please complete tuition to unlock unlimited submissions.`,
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
