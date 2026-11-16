const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('legacy adapter keeps the shared bounded response and privacy cleanup exports', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/tailorRequest.ts'), 'utf8');
  assert.match(source, /from '\.\/resumeComposer\/boundedResponse'/);
  assert.match(source, /export function clearTailorUsage\(\)/);
  assert.match(
    fs.readFileSync(path.join(root, 'src/services/resumeComposer/boundedResponse.ts'), 'utf8'),
    /export function readBoundedJsonResponse/,
  );
});
