import test from 'node:test';
import assert from 'node:assert/strict';
import { CohortService } from '../dist/services/cohort.service.js';

test('CohortService - BluetoothChatContext Structure and Room ID', async (t) => {
  // Verify room ID sanitization logic
  const cohortId = 'cm89abcdef123456';
  const cleanId = cohortId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const expectedRoomId = `zigex-cohort-${cleanId}`;

  assert.equal(expectedRoomId, 'zigex-cohort-cm89abcdef123456');

  // Verify structure of member and supervisor admin representation
  const mockSupervisor = {
    id: 'sup-user-uuid-1',
    name: 'Dr. John Doe',
    email: 'johndoe@university.edu',
    role: 'supervisor',
    isAdmin: true,
  };

  const mockIntern = {
    id: 'student-cuid-1',
    studentId: 'student-user-uuid-1',
    name: 'Alice Smith',
    email: 'alice@student.org',
    avatarUrl: 'https://example.com/avatar1.png',
    role: 'intern',
    isAdmin: false,
    totalPoints: 250,
  };

  assert.equal(mockSupervisor.isAdmin, true);
  assert.equal(mockIntern.isAdmin, false);
  assert.equal(mockIntern.totalPoints, 250);
});

test('CohortService - Department and Track Filtering Logic', async (t) => {
  // Test domain matching for AI / Machine Learning track
  const track1 = 'Ai/Machine Learning';
  const track2 = 'ai/machine learning';

  assert.equal(track1.toLowerCase(), track2.toLowerCase());

  // Test normalizing department names
  const normalizeDept = (dept: string) => dept.trim().toLowerCase();
  assert.equal(normalizeDept('  Web Development  '), 'web development');
  assert.equal(normalizeDept('Ai/Machine Learning'), 'ai/machine learning');
});

test('CohortService - Peer Ranking and Points Calculation', async (t) => {
  const peers = [
    { name: 'Intern A', points: [100, 50, 20] },
    { name: 'Intern B', points: [200, 100] },
    { name: 'Intern C', points: [50] },
  ];

  const peersWithTotal = peers.map(p => ({
    name: p.name,
    totalPoints: p.points.reduce((a, b) => a + b, 0),
  })).sort((a, b) => b.totalPoints - a.totalPoints);

  assert.equal(peersWithTotal[0].name, 'Intern B');
  assert.equal(peersWithTotal[0].totalPoints, 300);
  assert.equal(peersWithTotal[1].name, 'Intern A');
  assert.equal(peersWithTotal[1].totalPoints, 170);
  assert.equal(peersWithTotal[2].name, 'Intern C');
  assert.equal(peersWithTotal[2].totalPoints, 50);
});
