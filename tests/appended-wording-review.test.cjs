// Fictional offline cases. A review signal is not a factuality verdict.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const { runCase, CASES } = require('../scripts/product-quality-baseline.cjs');
const { appendedWordingNeedsReview } = load('services/resumeComposer/appendedWordingReview');

test('baseline appended-detail probes are flagged when retained, without silently changing wording', () => {
  for (const c of CASES.filter(c => c.id !== 'hospitality-en')) {
    const r = runCase(c, 'subtle-risk');
    assert.equal(r.technical.status, 'compiled', c.id);
    assert.deepEqual(r.retained, r.proposed, c.id);
    assert(r.reviewNotes.some(n => n.path === 'entries.work_1.bullets.0' && n.message.includes('compare the added wording')), c.id);
  }
});

test('separate fictional examples show literal coverage beyond development cases', () => {
  for (const [source, proposed] of [
    ['Organized stock in the storeroom.', 'Organized stock in the storeroom before opening.'],
    ['Recorded temperatures for the care team.', 'Recorded temperatures for the care team for pediatric patients.'],
    ['Préparé les documents pour les réunions.', 'Préparé les documents pour les réunions de direction.'],
    ['نسقت مواعيد الفريق خلال الأسبوع.', 'نسقت مواعيد الفريق خلال الأسبوع مع العملاء.'],
    ['Reviewed procurement records with the supervisor.', 'Reviewed procurement records with the supervisor independently.'],
  ]) assert.equal(appendedWordingNeedsReview(proposed, [source]), true, proposed);
});

test('unchanged text, a faithful rewrite, an all-source repeat and short prefixes are not flagged by this signal', () => {
  for (const [source, proposed] of [
    ['Organized stock in the storeroom.', 'Organized stock in the storeroom.'],
    ['Organized stock in the storeroom.', 'Organized storeroom stock.'],
    ['Organized stock in the storeroom.', 'Organized stock in the storeroom, stock in the storeroom.'],
    ['Organized stock.', 'Organized stock in the storeroom.'],
  ]) assert.equal(appendedWordingNeedsReview(proposed, [source]), false, proposed);
});

test('ambiguous multi-source synthesis is not labeled by the single-source signal', () => {
  assert.equal(appendedWordingNeedsReview('Organized stock in the storeroom before opening.', ['Organized stock in the storeroom.', 'Helped prepare for opening.']), false);
  assert.equal(appendedWordingNeedsReview('Organized stock in the storeroom before opening.', []), false);
});

test('literal token matches are a review cue, not a safety or semantic guarantee', () => {
  assert.equal(appendedWordingNeedsReview('Organized storeroom stock before opening.', ['Organized stock in the storeroom.']), false); // Paraphrased prefix is outside coverage.
  assert.equal(appendedWordingNeedsReview('Organized stock in the storeroom.', ['Organized stock in the storeroom.']), false); // Matching words are not proof.
});

test('review note is not emitted if a later overlap restores the proposed line', () => {
  const { fixture, job } = require('./helpers/composer-editorial-v4-fixture.cjs');
  const natural = load('services/resumeComposer/naturalDocument');
  const p = fixture();
  p.experience.data[0].bullets[0].text = 'Documented API behavior for the developer team.';
  const s = natural.prepareNaturalComposition(p, job).source;
  const f = new Map(s.evidence.map(item => [item.id, item.text]));
  const response = { summarySegments: [], entries: s.experience.map(e => ({
    id: e.id, overview: { text: '', sourceIds: [] }, bullets: [
      { text: 'Documented API behavior for the developer team and deployed the APIs.', sourceIds: ['work_1_b1'] },
      { text: 'Documented API behavior using Kubernetes.', sourceIds: ['work_1_b1'] },
      ...e.bulletIds.slice(1).map(id => ({ text: f.get(id), sourceIds: [id] })),
    ],
  })), skillSelections: [] };
  const out = natural.compileNaturalComposition(p, response, job);
  assert.equal(out.candidate.experience.data[0].bullets[0].text, p.experience.data[0].bullets[0].text);
  assert(out.guardNotes.some(n => n.message.includes('overlapping source passages')));
  assert(!out.guardNotes.some(n => n.message.includes('compare the added wording')));
});

test('harmless extra wording may receive an advisory rather than be blocked', () => {
  const source = 'Prepared monthly staff schedules.';
  const proposed = 'Prepared monthly staff schedules as part of my duties.';
  assert.equal(appendedWordingNeedsReview(proposed, [source]), true); // Known non-harmful signal.
});
