const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('the client bundle has no obsolete browser-side provider SDK path', () => {
  const sourceFiles = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  }
  visit(path.join(root, 'src'));

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /@google\/generative-ai|GoogleGenerativeAI/);
  }

  assert.equal(fs.existsSync(path.join(root, 'src/services/aiTailor.ts')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/components/sidebar/AIPanel.tsx')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/views/DashboardView.tsx')), false);
});
