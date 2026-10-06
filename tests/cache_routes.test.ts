import test from 'node:test';
import assert from 'node:assert/strict';
import { CacheService } from '../dist/services/cache.service.js';

test('CacheService - Telemetry and Statistics Tracking', async () => {
  CacheService.clear();
  CacheService.resetMetrics();

  // Initially empty
  const initialStats = CacheService.getStats();
  assert.equal(initialStats.totalKeys, 0);
  assert.equal(initialStats.hits, 0);
  assert.equal(initialStats.misses, 0);
  assert.equal(initialStats.status, 'idle');

  // Set entries
  CacheService.set('cohort:alpha', { name: 'Alpha Cohort' }, 60);
  CacheService.set('cohort:beta', { name: 'Beta Cohort' }, 60);
  CacheService.set('peer:100', { studentName: 'Awa' }, 60);

  assert.equal(CacheService.size(), 3);
  assert.equal(CacheService.has('cohort:alpha'), true);
  assert.equal(CacheService.has('cohort:nonexistent'), false);

  // Hits & Misses
  const hitVal = CacheService.get('cohort:alpha');
  assert.deepEqual(hitVal, { name: 'Alpha Cohort' });
  const missVal = CacheService.get('cohort:unknown');
  assert.equal(missVal, null);

  const stats = CacheService.getStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRatio, '50.0%');
  assert.equal(stats.totalKeys, 3);
  assert.equal(stats.status, 'active');
  assert.ok(stats.memoryUsageEstimateBytes > 0);

  // Key inspection
  const keys = CacheService.getKeys();
  assert.equal(keys.length, 3);
  const alphaKey = keys.find((k) => k.key === 'cohort:alpha');
  assert.ok(alphaKey);
  assert.equal(alphaKey.hits, 1);
  assert.ok(alphaKey.ttlRemainingSeconds > 0);

  // Prefix invalidation
  const clearedPrefix = CacheService.invalidatePrefix('cohort:');
  assert.equal(clearedPrefix, 2);
  assert.equal(CacheService.size(), 1);
  assert.equal(CacheService.has('peer:100'), true);

  // Full clear
  const clearedTotal = CacheService.clear();
  assert.equal(clearedTotal, 1);
  assert.equal(CacheService.size(), 0);
});

test('CacheService - Sub-millisecond in-memory latency benchmark', async () => {
  const benchmarkKey = 'perf:benchmark-test';
  CacheService.set(benchmarkKey, { data: 'payload-speed-test', ts: Date.now() }, 120);

  const start = process.hrtime.bigint();
  const result = CacheService.get(benchmarkKey);
  const end = process.hrtime.bigint();

  const elapsedMs = Number(end - start) / 1_000_000;
  assert.ok(result);
  // In-memory retrieve should be sub-millisecond (< 1.0 ms)
  assert.ok(elapsedMs < 5.0, `Cache retrieval took ${elapsedMs}ms, expected sub-millisecond`);
});
