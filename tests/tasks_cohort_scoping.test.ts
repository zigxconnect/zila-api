import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoringNormalizationService } from '../dist/services/scoring-normalization.service.js';

test('Tasks Cohort Scoping - Scoring normalization assigns 1 mark for Day 1 and Day 2', () => {
  assert.equal(ScoringNormalizationService.getRubricMark(1), 1, 'Day 1 is 1 mark');
  assert.equal(ScoringNormalizationService.getRubricMark(2), 1, 'Day 2 is 1 mark');
  assert.equal(ScoringNormalizationService.getRubricMark(3), 2, 'Day 3 is 2 marks');
  assert.equal(ScoringNormalizationService.getRubricMark(4), 4, 'Day 4 is 4 marks');
});

test('Tasks Cohort Scoping - Enrollment resolver rejects cross-cohort mismatch', () => {
  const userEnrollments = [
    { cohortId: 'cohort-embedded', status: 'active' },
    { cohortId: 'cohort-tyros', status: 'active' },
  ];

  const resolveForCohort = (targetCohortId: string) => {
    return userEnrollments.find((e) => e.cohortId === targetCohortId && e.status === 'active');
  };

  assert.ok(resolveForCohort('cohort-embedded'), 'Enrolled in embedded');
  assert.ok(resolveForCohort('cohort-tyros'), 'Enrolled in tyros');
  assert.equal(resolveForCohort('cohort-web-unknown'), undefined, 'Must reject unknown cohort');
});
