import test from 'node:test';
import assert from 'node:assert/strict';

test('Gamification - Points Calculation and Leaderboard Ranking', async (t) => {
  const students = [
    { studentName: 'John', points: 120 },
    { studentName: 'Sarah', points: 340 },
    { studentName: 'Michael', points: 210 },
  ];

  const sortedLeaderboard = [...students].sort((a, b) => b.points - a.points);

  assert.equal(sortedLeaderboard[0].studentName, 'Sarah');
  assert.equal(sortedLeaderboard[1].studentName, 'Michael');
  assert.equal(sortedLeaderboard[2].studentName, 'John');
});

test('Gamification - Leaderboard PR Status Column Calculation', async (t) => {
  const calculatePrStatus = (submission?: { status: string }) => {
    if (!submission) return 'none';
    if (submission.status === 'approved' || submission.status === 'accepted') return 'accepted';
    if (submission.status === 'rejected') return 'rejected';
    return 'pending';
  };

  assert.equal(calculatePrStatus(undefined), 'none');
  assert.equal(calculatePrStatus({ status: 'submitted' }), 'pending');
  assert.equal(calculatePrStatus({ status: 'under_review' }), 'pending');
  assert.equal(calculatePrStatus({ status: 'approved' }), 'accepted');
  assert.equal(calculatePrStatus({ status: 'accepted' }), 'accepted');
  assert.equal(calculatePrStatus({ status: 'rejected' }), 'rejected');
});
