const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('legacy adapter imports the shared bounded response helper', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/tailorRequest.ts'), 'utf8');
  assert.match(source, /from '\.\/resumeComposer\/boundedResponse'/);
  assert.match(
    fs.readFileSync(path.join(root, 'src/services/resumeComposer/boundedResponse.ts'), 'utf8'),
    /export function readBoundedJsonResponse/,
  );
});
