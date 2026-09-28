import test from 'node:test';
import assert from 'node:assert/strict';
import { CacheService } from '../dist/services/cache.service.js';

test('CacheService - wrap and in-memory caching', async () => {
  let factoryCalls = 0;

  const fetcher = async () => {
    factoryCalls++;
    return { name: 'AI/Machine Learning Cohort', count: 16 };
  };

  // First call should run factory
  const res1 = await CacheService.wrap('cohort:test-123', 60, fetcher);
  assert.equal(res1.name, 'AI/Machine Learning Cohort');
  assert.equal(factoryCalls, 1);

  // Second call should return cached result without calling factory
  const res2 = await CacheService.wrap('cohort:test-123', 60, fetcher);
  assert.equal(res2.name, 'AI/Machine Learning Cohort');
  assert.equal(factoryCalls, 1);

  // Invalidate by prefix
  CacheService.invalidatePrefix('cohort:test-');
  const res3 = await CacheService.wrap('cohort:test-123', 60, fetcher);
  assert.equal(factoryCalls, 2);
});
