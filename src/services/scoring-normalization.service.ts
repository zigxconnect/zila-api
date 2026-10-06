/**
 * Scoring Normalization Service
 * Normalizes daily exercise marks according to cohort curriculum weights:
 * - Day 1: 1 pt (12.5% normalized)
 * - Day 2: 1 pt (12.5% normalized)
 * - Day 3: 2 pts (25.0% normalized)
 * - Day 4: 4 pts (50.0% normalized)
 * Total raw weight = 8. Normalized to 100%.
 */

export interface DayWeightDefinition {
  day: number;
  label: string;
  rawWeight: number;
  normalizedPercentage: number;
}

export class ScoringNormalizationService {
  public static readonly DAY_WEIGHTS: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
  };

  public static readonly TOTAL_RAW_WEIGHT = 8; // 1 + 1 + 2 + 4

  /**
   * Returns weight definitions normalized over 100
   */
  static getRubric(): DayWeightDefinition[] {
    return [1, 2, 3, 4].map((day) => {
      const rawWeight = this.DAY_WEIGHTS[day] ?? 1;
      const normalizedPercentage = (rawWeight / this.TOTAL_RAW_WEIGHT) * 100;
      return {
        day,
        label: `Day 0${day}`,
        rawWeight,
        normalizedPercentage: Math.round(normalizedPercentage * 10) / 10,
      };
    });
  }

  /**
   * Normalizes a tutor-assigned grade for a specific exercise day over 100
   * @param day Day number (1 to 4)
   * @param tutorScore Percentage or score achieved on that day (0 - 100)
   */
  static normalizeDayScore(day: number, tutorScore: number): number {
    const rawWeight = this.DAY_WEIGHTS[day] ?? 1;
    const dayWeightRatio = rawWeight / this.TOTAL_RAW_WEIGHT;
    const normalizedContribution = (Math.max(0, Math.min(100, tutorScore)) * dayWeightRatio);
    return Math.round(normalizedContribution * 10) / 10;
  }

  /**
   * Returns the normalized percentage weight for a specific curriculum day
   */
  static getDayNormalizedShare(day: number): number {
    const raw = this.DAY_WEIGHTS[day] ?? 1;
    return Math.round((raw / this.TOTAL_RAW_WEIGHT) * 100 * 10) / 10;
  }

  /**
   * Validates if a given day number is within curriculum sprint bounds (1 to 4)
   */
  static validateDayNumber(day: number): boolean {
    return Number.isInteger(day) && day >= 1 && day <= 4;
  }
}
