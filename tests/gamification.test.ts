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

test('Gamification - Badge Unlock Logic', async (t) => {
  const evaluateBadgeUnlock = (points: number, required: number) => points >= required;

  assert.equal(evaluateBadgeUnlock(150, 100), true);
  assert.equal(evaluateBadgeUnlock(80, 100), false);
  assert.equal(evaluateBadgeUnlock(100, 100), true);
});
