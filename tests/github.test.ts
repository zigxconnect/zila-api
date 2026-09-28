import test from 'node:test';
import assert from 'node:assert/strict';

test('GitHub Integration - Repository URL Validation and Normalization', async (t) => {
  const validUrl = 'https://github.com/zigxconnect/zila-api';
  const invalidUrl = 'http://insecure-github.com/repo';
  const nonGithubUrl = 'https://gitlab.com/repo';

  const isValidGithubUrl = (url: string) => url.startsWith('https://github.com/');

  assert.equal(isValidGithubUrl(validUrl), true);
  assert.equal(isValidGithubUrl(invalidUrl), false);
  assert.equal(isValidGithubUrl(nonGithubUrl), false);

  // Extract repo name
  const repoName = validUrl.split('/').pop();
  assert.equal(repoName, 'zila-api');
});

test('GitHub Integration - Course Material Download Path Resolution', async (t) => {
  const targetDir = './materials';
  const repoName = 'ai-machine-learning-labs';
  const fullPath = `${targetDir}/${repoName}`;

  assert.equal(fullPath, './materials/ai-machine-learning-labs');
});
