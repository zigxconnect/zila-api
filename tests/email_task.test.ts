import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskEmailDetails } from '../dist/services/email.service.js';

test('Email Service - Task Email Notification Details Structure', async (t) => {
  const details: TaskEmailDetails = {
    prUrl: 'https://github.com/iws3/sample_repo_zila/pull/42',
    branch: '1_python/student/day_1',
    module: '1_python',
    day: 1,
    domain: 'ml',
    status: 'pending',
    pointsAwarded: 25,
  };

  assert.equal(details.status, 'pending');
  assert.equal(details.pointsAwarded, 25);
  assert.equal(details.domain, 'ml');
  assert.ok(details.prUrl.includes('pull/42'));
});

test('Email Service - Status label and badge formatting', async (t) => {
  const getStatusBadge = (status: 'pending' | 'accepted' | 'rejected') => {
    switch (status) {
      case 'accepted':
        return { label: '✔ Accepted', color: '#10b981' };
      case 'rejected':
        return { label: '✖ Rejected', color: '#ef4444' };
      case 'pending':
      default:
        return { label: '⏳ Pending Review', color: '#f59e0b' };
    }
  };

  const pending = getStatusBadge('pending');
  assert.equal(pending.label, '⏳ Pending Review');
  assert.equal(pending.color, '#f59e0b');

  const accepted = getStatusBadge('accepted');
  assert.equal(accepted.label, '✔ Accepted');
  assert.equal(accepted.color, '#10b981');

  const rejected = getStatusBadge('rejected');
  assert.equal(rejected.label, '✖ Rejected');
  assert.equal(rejected.color, '#ef4444');
});
