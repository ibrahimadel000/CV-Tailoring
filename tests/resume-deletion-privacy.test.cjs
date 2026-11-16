const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'src/store/useAppStore.ts'), 'utf8');
const request = fs.readFileSync(path.join(root, 'src/services/tailorRequest.ts'), 'utf8');

test('resume deletion clears unscoped tailoring diagnostics and active job text', () => {
  assert.match(request, /export function clearTailorUsage\(\)/);
  assert.match(request, /localStorage\.removeItem\(USAGE_KEY\)/);
  assert.match(store, /import \{ clearTailorUsage \} from '@\/services\/tailorRequest'/);
  assert.match(store, /const wasActive = get\(\)\.activeProfileId === id/);
  assert.match(store, /jobDescription: wasActive \? '' : state\.jobDescription/);
  assert.match(store, /clearTailorUsage\(\);/);
});
