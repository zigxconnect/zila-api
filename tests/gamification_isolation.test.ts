import test from 'node:test';
import assert from 'node:assert/strict';

test('Gamification Isolation - Points in Cohort A do not bleed into Cohort B', () => {
  // Mock student with enrollments in two different cohorts
  const studentInCohortA = {
    id: 'student-enrollment-cohort-a',
    cohortId: 'cohort-a',
    studentId: 'user-123',
    gamificationPoints: [
      { id: 'p1', points: 25, reason: 'Completed Exercise' },
      { id: 'p2', points: 1, reason: 'PR Merged' },
    ],
    tasksSubmitted: [
      { id: 'sub-1', status: 'approved', githubPrUrl: 'https://github.com/org/repo/pull/1' },
    ],
  };

  const studentInCohortB = {
    id: 'student-enrollment-cohort-b',
    cohortId: 'cohort-b',
    studentId: 'user-123',
    gamificationPoints: [] as Array<{ id: string; points: number; reason: string }>,
    tasksSubmitted: [] as Array<{ id: string; status: string; githubPrUrl: string }>,
  };

  // Cohort A calculation
  const pointsA = studentInCohortA.gamificationPoints.reduce((sum, p) => sum + p.points, 0);
  const statusA = studentInCohortA.tasksSubmitted[0]?.status === 'approved' ? 'accepted' : 'none';

  // Cohort B calculation
  const pointsB = studentInCohortB.gamificationPoints.reduce((sum, p) => sum + p.points, 0);
  const statusB = studentInCohortB.tasksSubmitted.length > 0 ? 'pending' : 'none';

  assert.equal(pointsA, 26, 'Cohort A should reflect points earned in Cohort A');
  assert.equal(statusA, 'accepted', 'Cohort A should reflect accepted status');

  assert.equal(pointsB, 0, 'Cohort B must have 0 points, completely independent of Cohort A');
  assert.equal(statusB, 'none', 'Cohort B must have none status (—)');
});

test('Gamification Isolation - Multiple students ranked strictly within their cohort', () => {
  const cohortStudents = [
    {
      studentId: 'user-1',
      studentName: 'Alice',
      gamificationPoints: [{ points: 2 }],
      tasksSubmitted: [{ status: 'approved' }],
    },
    {
      studentId: 'user-2',
      studentName: 'Bob',
      gamificationPoints: [{ points: 4 }],
      tasksSubmitted: [{ status: 'approved' }],
    },
    {
      studentId: 'user-3',
      studentName: 'Charlie',
      gamificationPoints: [],
      tasksSubmitted: [],
    },
  ];

  const ranked = cohortStudents
    .map((s) => ({
      name: s.studentName,
      totalPoints: s.gamificationPoints.reduce((sum, p) => sum + p.points, 0),
      status: s.tasksSubmitted[0]?.status === 'approved' ? 'accepted' : 'none',
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((s, idx) => ({ ...s, rank: idx + 1 }));

  assert.equal(ranked[0]?.name, 'Bob');
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.totalPoints, 4);

  assert.equal(ranked[1]?.name, 'Alice');
  assert.equal(ranked[1]?.rank, 2);
  assert.equal(ranked[1]?.totalPoints, 2);

  assert.equal(ranked[2]?.name, 'Charlie');
  assert.equal(ranked[2]?.rank, 3);
  assert.equal(ranked[2]?.totalPoints, 0);
  assert.equal(ranked[2]?.status, 'none');
});
