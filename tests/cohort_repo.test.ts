import test from 'node:test';
import assert from 'node:assert/strict';

test('Cohort Management - Dynamic Level Resolution', () => {
  const detectLevel = (title: string, rawLevel?: string) => {
    return (rawLevel || (/advanced/i.test(title) ? 'advanced' : /beginner/i.test(title) ? 'beginner' : 'intermediate')).toLowerCase();
  };

  assert.equal(detectLevel('Machine Learning & AI - Beginner Track'), 'beginner');
  assert.equal(detectLevel('Advanced Deep Learning Cohort'), 'advanced');
  assert.equal(detectLevel('Fullstack Web Bootcamp'), 'intermediate');
  assert.equal(detectLevel('Any Title', 'advanced'), 'advanced');
});

test('Cohort Management - Supervisor GitHub Repository Assignment', () => {
  const DEFAULT_REPO = 'https://github.com/iws3/sample_repo_zila.git';

  const resolveCohortRepo = (cohortRepoUrl?: string | null) => {
    return (cohortRepoUrl && cohortRepoUrl.trim()) ? cohortRepoUrl.trim() : DEFAULT_REPO;
  };

  assert.equal(resolveCohortRepo('https://github.com/org/custom_cohort_repo.git'), 'https://github.com/org/custom_cohort_repo.git');
  assert.equal(resolveCohortRepo(null), DEFAULT_REPO);
  assert.equal(resolveCohortRepo(''), DEFAULT_REPO);
});

test('Cohort Management - Prompt Slug Generation', () => {
  const generateSlug = (name: string, dept?: string) => {
    const base = dept || name.split('-')[0] || name;
    return base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cohort';
  };

  assert.equal(generateSlug('Machine Learning & AI - Fall 2026', 'ml'), 'ml');
  assert.equal(generateSlug('Web Development Bootcamp'), 'web-development-bootcamp');
  assert.equal(generateSlug('Cybersecurity Defense', 'cyber'), 'cyber');
});
