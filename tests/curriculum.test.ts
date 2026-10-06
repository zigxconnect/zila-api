import test from 'node:test';
import assert from 'node:assert/strict';
import { CurriculumService } from '../dist/services/curriculum.service.js';

test('CurriculumService - Resolves multiple domains dynamically', () => {
  const domains = CurriculumService.getAllDomains();
  assert.ok(domains.length >= 6);

  const domainIds = domains.map((d) => d.id);
  assert.ok(domainIds.includes('ml'));
  assert.ok(domainIds.includes('web'));
  assert.ok(domainIds.includes('cyber'));
  assert.ok(domainIds.includes('embeded'));
  assert.ok(domainIds.includes('app'));
  assert.ok(domainIds.includes('cloud'));
});

test('CurriculumService - Resolves tiered modules for Web, Cyber, Embedded, and App', () => {
  // Web
  const webBeginner = CurriculumService.getModules('web', 'beginner');
  assert.ok(webBeginner.includes('1_html_css_javascript'));
  const webIntermediate = CurriculumService.getModules('web', 'intermediate');
  assert.ok(webIntermediate.includes('1_nodejs_and_microservices'));

  // Cyber
  const cyberBeginner = CurriculumService.getModules('cyber', 'beginner');
  assert.ok(cyberBeginner.includes('1_networking_and_linux_security'));

  // Embedded
  const embededBeginner = CurriculumService.getModules('embeded', 'beginner');
  assert.ok(embededBeginner.includes('1_c_and_embedded_fundamentals'));

  // App
  const appBeginner = CurriculumService.getModules('app', 'beginner');
  assert.ok(appBeginner.includes('1_mobile_ui_and_dart_flutter'));
});

test('CurriculumService - Dynamic fallback for custom domains', () => {
  const custom = CurriculumService.getModules('robotics', 'intermediate');
  assert.ok(custom.length > 0);
  assert.ok(custom[0]?.includes('robotics'));

  const sanitized = CurriculumService.sanitizePathComponent('../../dangerous/path!@#');
  assert.equal(sanitized.includes('..'), false);
  assert.equal(sanitized.includes('/'), false);
  assert.equal(sanitized, 'dangerous_path');
});
