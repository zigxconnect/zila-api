import test from 'node:test';
import assert from 'node:assert/strict';

test('Documents - RAG Metadata & Allowed File Types', async (t) => {
  const allowedExtensions = ['pdf', 'docx', 'md', 'txt'];
  const isValidFileType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? allowedExtensions.includes(ext) : false;
  };

  assert.equal(isValidFileType('lecture-week1.pdf'), true);
  assert.equal(isValidFileType('curriculum.md'), true);
  assert.equal(isValidFileType('notes.docx'), true);
  assert.equal(isValidFileType('malicious.exe'), false);
  assert.equal(isValidFileType('script.sh'), false);
});

test('Documents - RAG Semantic Search Keyword Matching', async (t) => {
  const docs = [
    { title: 'Neural Networks Basics', keywords: ['ai', 'deep learning', 'pytorch'] },
    { title: 'Full Stack Express Guide', keywords: ['node', 'api', 'backend'] },
    { title: 'Data Cleaning with Pandas', keywords: ['python', 'ml', 'pandas'] },
  ];

  const query = 'deep learning';
  const matched = docs.filter(d =>
    d.title.toLowerCase().includes(query.toLowerCase()) ||
    d.keywords.some(k => k.includes(query.toLowerCase()))
  );

  assert.equal(matched.length, 1);
  assert.equal(matched[0].title, 'Neural Networks Basics');
});
