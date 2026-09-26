import test from 'node:test';
import assert from 'node:assert/strict';

test('Weekly Scoring - Overall Score Formula Weightings', async (t) => {
  // Formula:
  // Task completion: 40%
  // Punctuality: 30%
  // Points earned normalized: 30%
  const calculateScore = (completionRate: number, punctualityRate: number, pointsScore: number) => {
    return Math.round((completionRate * 0.4) + (punctualityRate * 0.3) + (pointsScore * 0.3));
  };

  const perfect = calculateScore(100, 100, 100);
  assert.equal(perfect, 100);

  const partial = calculateScore(80, 70, 90); // 32 + 21 + 27 = 80
  assert.equal(partial, 80);
});
