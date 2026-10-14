const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadQuestions } = require('../lib/questions');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdq-q-'));
  const file = path.join(dir, 'questions.json');
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

test('creates the sample bank when there is no file', () => {
  const file = tmpFile();
  assert.equal(loadQuestions(file).length, 15);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 15);
});

test('keeps good questions and skips broken ones without rewriting the file', () => {
  const content = JSON.stringify([
    { q: 'Good?', a: ['a', 'b', 'c', 'd'], correct: 1 },
    { q: 'Missing answer', a: ['a', '', 'c', 'd'], correct: 0 },
  ]);
  const file = tmpFile(content);
  const loaded = loadQuestions(file);
  assert.deepEqual(loaded, [{ q: 'Good?', a: ['a', 'b', 'c', 'd'], correct: 1 }]);
  assert.equal(fs.readFileSync(file, 'utf8'), content);
});

test('backs up a file it cannot parse before falling back to samples', () => {
  const file = tmpFile('{ not json');
  assert.equal(loadQuestions(file).length, 15);
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), '{ not json');
});
