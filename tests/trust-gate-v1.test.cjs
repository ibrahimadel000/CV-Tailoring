'use strict';

const assert = require('node:assert/strict');
const { HASH, run } = require('../scripts/trust-gate-v1.cjs');

const report = run();
const serialized = JSON.stringify(report);
const allStrings = [];
function collect(value) {
  if (typeof value === 'string') allStrings.push(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(report);

assert.equal(report.gate, 'trust-gate-v1');
assert.equal(report.decision, 'review_required');
assert.equal(report.qualityDecision, 'not_evaluated');
assert.equal(report.providerCalls, 0);
assert.equal(report.networkCalls, 0);
assert.equal(report.contract.rawTextOutput, false);
assert.equal(report.contract.separateFrozenHoldout, false);
assert.equal(report.contract.previewExportTrace, 'not_implemented');
assert.equal(report.coverage.cases, 60);
assert.ok(report.coverage.occupations.length >= 8);
assert.deepEqual(report.coverage.languages.sort(), ['ar', 'en']);
assert.equal(report.coverage.allSemanticUnassessed, true);
assert.equal(report.traces.length, 60);

for (const trace of report.traces) {
  assert.equal(trace.semanticStatus, 'unassessed');
  const candidateHashes = [];
  function collectHashes(value) {
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'sha256') candidateHashes.push(child);
        else collectHashes(child);
      }
    } else if (Array.isArray(value)) value.forEach(collectHashes);
  }
  collectHashes(trace);
  for (const hash of candidateHashes) assert.match(hash, HASH);
}

assert.ok(serialized.includes('rawTextOutput'));
assert.ok(serialized.includes('separateFrozenHoldout'));
assert.ok(!serialized.includes('Fictional organization'));
assert.ok(!serialized.includes('patient transfers'));
assert.ok(!serialized.includes('المستندات'));

for (const value of allStrings) {
  assert.ok(value.length < 250, `Unexpectedly large unredacted value: ${value.slice(0, 40)}`);
}

console.log('Trust Gate v1 redaction and technical contract checks passed.');
