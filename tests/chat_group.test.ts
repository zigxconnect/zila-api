import test from 'node:test';
import assert from 'node:assert/strict';

test('Bluetooth Chat Group - Schema and Authorization Model', async (t) => {
  const supervisorUser = {
    id: 'sup-1',
    role: 'supervisor',
  };

  const studentUser = {
    id: 'stud-1',
    role: 'student',
  };

  const checkIsAdmin = (user: { role: string }) => user.role === 'supervisor';

  assert.equal(checkIsAdmin(supervisorUser), true);
  assert.equal(checkIsAdmin(studentUser), false);
});

test('Bluetooth Chat Group - Payload Serialization for P2P Discovery', async (t) => {
  const payload = {
    roomId: 'zigex-cohort-aiml-2024',
    title: 'AI/Machine Learning Cohort 1',
    admin: 'Prof. Xavier',
    memberCount: 15,
  };

  const serialized = JSON.stringify(payload);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.roomId, 'zigex-cohort-aiml-2024');
  assert.equal(parsed.admin, 'Prof. Xavier');
  assert.equal(parsed.memberCount, 15);
});
