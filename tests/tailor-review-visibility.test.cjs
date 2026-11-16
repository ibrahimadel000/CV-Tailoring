'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const { hasTailoredResult } = load('components/builder/tailorReviewVisibility');

test('review checklist visibility supports current and legacy tailored copies', () => {
  assert.equal(hasTailoredResult({ compositionChanges: { mode: 'rewrite' } }), true);
  assert.equal(hasTailoredResult({ tailoring: { sourceProfileId: 'source-1' } }), true);
  assert.equal(hasTailoredResult({ compositionChanges: undefined, tailoring: undefined }), false);
  assert.equal(hasTailoredResult(undefined), false);
});
