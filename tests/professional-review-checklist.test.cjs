// Contract test for the human review gate. It is not an AI quality score.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/components/builder/ComposerTailorWorkspace.tsx', 'utf8');

test('professional review checklist covers the product quality dimensions', () => {
  for (const label of ['Truth and scope', 'Job relevance', 'Coverage', 'Clarity', 'User control', 'Preview and export']) {
    assert.match(source, new RegExp(`[\"']${label}[\"']`), label);
  }
  assert.match(source, /not an AI score, factual certification or guarantee of job fit/);
  assert.match(source, /job description is not evidence/);
  assert.match(source, /tailoredResultVisible/);
  assert.match(source, /tailorReviewVisibility/);
});
