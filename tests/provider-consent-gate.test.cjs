const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/builder/ComposerTailorWorkspace.tsx'), 'utf8');

test('the active tailor action requires explicit provider consent', () => {
  assert.match(source, /const \[consent, setConsent\] = useState\(false\)/);
  assert.match(source, /current professional resume content and this job description will be sent to Google/);
  assert.match(source, /!consent \|\| job\.trim\(\)\.length < 40/);
  assert.match(source, /if \(controller\.current \|\| !active \|\| !consent\) return/);
  assert.match(source, /setConsent\(false\)/);
});
