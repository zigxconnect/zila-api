import test from 'node:test';
import assert from 'node:assert/strict';
import { SubmissionQuotaService } from '../dist/services/submission-quota.service.js';
import { ScoringNormalizationService } from '../dist/services/scoring-normalization.service.js';

test('SubmissionQuotaService - Enforces 1 PR recommended, max 2 PRs daily', () => {
  // 0 submissions today -> allowed, 2 remaining
  const q0 = SubmissionQuotaService.evaluateQuota(0);
  assert.equal(q0.allowed, true);
  assert.equal(q0.countToday, 0);
  assert.equal(q0.remainingToday, 2);
  assert.ok(q0.message.includes('2/2'));

  // 1 submission today -> allowed, 1 remaining, recommended notice
  const q1 = SubmissionQuotaService.evaluateQuota(1);
  assert.equal(q1.allowed, true);
  assert.equal(q1.countToday, 1);
  assert.equal(q1.remainingToday, 1);
  assert.ok(q1.message.includes('1/2'));

  // 2 submissions today -> rejected (max reached)
  const q2 = SubmissionQuotaService.evaluateQuota(2);
  assert.equal(q2.allowed, false);
  assert.equal(q2.countToday, 2);
  assert.equal(q2.remainingToday, 0);
  assert.ok(q2.message.includes('quota reached'));

  // > 2 submissions -> rejected
  const q3 = SubmissionQuotaService.evaluateQuota(3);
  assert.equal(q3.allowed, false);
  assert.equal(q3.remainingToday, 0);

  // Helper methods
  assert.equal(SubmissionQuotaService.isWithinDailyLimit(0), true);
  assert.equal(SubmissionQuotaService.isWithinDailyLimit(1), true);
  assert.equal(SubmissionQuotaService.isWithinDailyLimit(2), false);
  assert.equal(SubmissionQuotaService.getQuotaRemaining(0), 2);
  assert.equal(SubmissionQuotaService.getQuotaRemaining(1), 1);
  assert.equal(SubmissionQuotaService.getQuotaRemaining(2), 0);
});

test('ScoringNormalizationService - Day weights normalized over 100', () => {
  const rubric = ScoringNormalizationService.getRubric();
  assert.equal(rubric.length, 4);

  // Day 1: 1/8 * 100 = 12.5%
  const day1 = rubric.find((r) => r.day === 1);
  assert.ok(day1);
  assert.equal(day1.rawWeight, 1);
  assert.equal(day1.normalizedPercentage, 12.5);

  // Day 2: 1/8 * 100 = 12.5%
  const day2 = rubric.find((r) => r.day === 2);
  assert.ok(day2);
  assert.equal(day2.rawWeight, 1);
  assert.equal(day2.normalizedPercentage, 12.5);

  // Day 3: 2/8 * 100 = 25.0%
  const day3 = rubric.find((r) => r.day === 3);
  assert.ok(day3);
  assert.equal(day3.rawWeight, 2);
  assert.equal(day3.normalizedPercentage, 25.0);

  // Day 4: 4/8 * 100 = 50.0%
  const day4 = rubric.find((r) => r.day === 4);
  assert.ok(day4);
  assert.equal(day4.rawWeight, 4);
  assert.equal(day4.normalizedPercentage, 50.0);

  // Total sums to 100%
  const totalPercentage = rubric.reduce((sum, r) => sum + r.normalizedPercentage, 0);
  assert.equal(totalPercentage, 100.0);

  // Normalization calculation: 100% on Day 4 contributes 50 points to total grade
  assert.equal(ScoringNormalizationService.normalizeDayScore(4, 100), 50.0);
  // 100% on Day 1 contributes 12.5 points
  assert.equal(ScoringNormalizationService.normalizeDayScore(1, 100), 12.5);
  // 80% on Day 3 contributes 80 * 0.25 = 20 points
  assert.equal(ScoringNormalizationService.normalizeDayScore(3, 80), 20.0);

  // getDayNormalizedShare helper
  assert.equal(ScoringNormalizationService.getDayNormalizedShare(1), 12.5);
  assert.equal(ScoringNormalizationService.getDayNormalizedShare(2), 12.5);
  assert.equal(ScoringNormalizationService.getDayNormalizedShare(3), 25.0);
  assert.equal(ScoringNormalizationService.getDayNormalizedShare(4), 50.0);
});
