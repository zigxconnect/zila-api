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

test('Task System - Auto-submit anti-cheating payload and proposed mark validation', () => {
  const parseProposedMark = (mark?: number | string) => {
    if (mark === undefined || mark === null) return undefined;
    return Math.max(0.0, Math.min(1.0, Number(mark)));
  };

  // Normal mark
  assert.equal(parseProposedMark(0.85), 0.85);

  // Clamped at 1.0 max
  assert.equal(parseProposedMark(1.5), 1.0);

  // Clamped at 0.0 min
  assert.equal(parseProposedMark(-0.2), 0.0);

  // Formatted content check
  const generateAuditSection = (params: {
    whatStudentDid?: string;
    howTheySolved?: string;
    cheatingRisk?: string;
    proposedMark?: number;
    integrityReport?: string;
  }) => {
    const mark = parseProposedMark(params.proposedMark);
    return [
      params.whatStudentDid ? `### What Student Did\n${params.whatStudentDid}` : null,
      params.howTheySolved ? `### How They Solved\n${params.howTheySolved}` : null,
      `### Supervisor Integrity & Anti-Cheating Audit\n- Status: ${params.cheatingRisk || 'CLEAN'}\n- Proposed Allocation Mark: ${mark !== undefined ? mark.toFixed(2) + ' / 1.0' : 'N/A'}\n- Findings: ${params.integrityReport || 'Clean incremental progression; no malpractice detected.'}`,
    ].filter(Boolean).join('\n\n');
  };

  const auditSection = generateAuditSection({
    whatStudentDid: 'Built non-blocking circular buffer with head/tail pointers',
    howTheySolved: 'Iterative commits with wraparound unit tests',
    cheatingRisk: 'CLEAN',
    proposedMark: 0.95,
    integrityReport: 'Verified genuine development velocity',
  });

  assert.ok(auditSection.includes('### What Student Did'));
  assert.ok(auditSection.includes('Built non-blocking circular buffer'));
  assert.ok(auditSection.includes('### How They Solved'));
  assert.ok(auditSection.includes('Iterative commits with wraparound unit tests'));
  assert.ok(auditSection.includes('- Proposed Allocation Mark: 0.95 / 1.0'));
  assert.ok(auditSection.includes('- Status: CLEAN'));
});

