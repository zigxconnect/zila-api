import test from 'node:test';
import assert from 'node:assert/strict';

test('Task System - Submission Validation & PR Requirement', async (t) => {
  const task = {
    id: 'task-1',
    title: 'Implement Authentication API',
    githubRequired: true,
    prRequired: true,
  };

  const validateSubmission = (t: typeof task, sub: { githubPrUrl?: string; githubRepoUrl?: string }) => {
    if (t.prRequired && !sub.githubPrUrl) {
      return { valid: false, error: 'PR URL is required for this task' };
    }
    if (t.githubRequired && !sub.githubRepoUrl) {
      return { valid: false, error: 'GitHub repository URL is required' };
    }
    return { valid: true };
  };

  assert.equal(validateSubmission(task, {}).valid, false);
  assert.equal(validateSubmission(task, { githubRepoUrl: 'https://github.com/foo/bar' }).valid, false);
  assert.equal(validateSubmission(task, {
    githubRepoUrl: 'https://github.com/foo/bar',
    githubPrUrl: 'https://github.com/foo/bar/pull/1',
  }).valid, true);
});
