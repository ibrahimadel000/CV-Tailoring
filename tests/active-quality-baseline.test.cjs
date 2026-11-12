// Fictional offline checks of the diagnostic. No model or external network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CASES, run } = require('../scripts/product-quality-baseline.cjs');

test('active-path fictional baseline records copies and scope-risk proposals without a semantic verdict', () => {
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('Unexpected network request in offline diagnostic'); };
  try {
    const results = run();
    assert.equal(results.length, CASES.length * 2);
    assert.equal(new Set(CASES.map(c => c.id)).size, CASES.length);
    assert(CASES.some(c => c.language === 'ar'));
    assert(new Set(CASES.map(c => c.occupation)).size >= 6);
    for (const result of results) {
      assert.equal(result.semanticStatus, 'unassessed');
      assert.match(result.promptSha256, /^[a-f0-9]{64}$/);
      assert.match(result.wireSha256, /^[a-f0-9]{64}$/);
      assert(['compiled', 'rejected'].includes(result.technical.status));
      assert.equal(result.proposed.length, result.source.bullets.length);
      if (result.variant === 'copy') {
        assert.equal(result.technical.status, 'compiled', `${result.caseId} copy should compile`);
        assert.deepEqual(result.retained, result.source.bullets);
      } else {
        assert.notEqual(result.proposed[0], result.source.bullets[0]);
        // Do not assert that any guard recognized the unsafe proposal. A human
        // must inspect the proposed and retained text, even when it compiled.
      }
    }
  } finally { global.fetch = originalFetch; }
});
