'use strict';

// Trust Gate v1 is a technical integrity and evidence-trace harness. It is
// deliberately not a semantic scorer, factuality certifier, or release claim.
// It consumes fictional, hand-authored offline fixtures and emits metadata only:
// no CV, job, provider response, prompt, or retained wording is printed.
const crypto = require('node:crypto');
const product = require('./product-quality-baseline.cjs');
const relations = require('./factual-relations-baseline.cjs');
const relationshipProbes = require('./relationship-risk-probes.cjs');

const VERSION = 'trust-gate-v1';
const HASH = /^[a-f0-9]{64}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function textMeta(value) {
  const text = String(value ?? '');
  return { chars: text.length, sha256: sha256(text) };
}

function listMeta(values) {
  const items = Array.isArray(values) ? values : [];
  return {
    count: items.length,
    items: items.map((value) => textMeta(value)),
  };
}

function warningPaths(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => (value && typeof value === 'object' ? value.path : undefined))
    .filter((value) => typeof value === 'string')
    .slice(0, 100);
}

function productTrace(result) {
  return {
    set: 'active-single-draft-development',
    caseId: result.caseId,
    occupation: result.occupation,
    language: result.language,
    variant: result.variant,
    source: {
      role: textMeta(result.source.role),
      bulletCount: result.source.bullets.length,
      skillCount: 1,
      skillCategory: textMeta(result.source.skill[1]),
      skillLevel: textMeta(result.source.skill[2]),
    },
    job: textMeta(result.job),
    provider: { called: false, responseFixture: 'hand-authored' },
    request: { promptSha256: result.promptSha256, wireSha256: result.wireSha256 },
    proposed: { entries: result.proposed.map(textMeta) },
    compiler: {
      technicalStatus: result.technical.status,
      warningCount: result.reviewNotes.length,
      warningPaths: warningPaths(result.reviewNotes),
    },
    retained: result.retained === null ? null : { entries: result.retained.map(textMeta) },
    proposalCounts: result.proposalCounts,
    semanticStatus: result.semanticStatus,
  };
}

function relationTrace(result) {
  return {
    set: 'factual-relationship-development',
    caseId: result.caseId,
    occupation: result.occupation,
    language: result.language,
    variant: result.variant,
    source: textMeta(result.source),
    job: textMeta(result.job),
    provider: { called: false, responseFixture: 'hand-authored' },
    request: { promptSha256: result.promptSha256, requestSha256: result.requestSha256 },
    proposed: textMeta(result.proposed),
    retained: listMeta(result.retained),
    review: { warningCount: result.reviewNotes.length },
    semanticStatus: result.semanticStatus,
  };
}

function relationshipTrace(result) {
  return {
    set: 'relationship-risk-development',
    caseId: result.id,
    occupation: result.profession,
    language: result.language,
    variant: result.variant,
    source: textMeta(result.source),
    proposed: textMeta(result.proposed),
    retained: listMeta(result.retained),
    review: {
      warningCount: result.notes.length,
      exactProposalRetained: result.exactProposalRetained,
    },
    semanticStatus: result.semanticStatus,
  };
}

function withNetworkTripwire(fn) {
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = (...args) => {
    calls += 1;
    throw new Error(`Network disabled by Trust Gate v1 (${args.length} arguments).`);
  };
  try {
    return { value: fn(), networkCalls: calls };
  } finally {
    global.fetch = previousFetch;
  }
}

function runSet(name, fn, map) {
  try {
    const result = withNetworkTripwire(fn);
    return {
      name,
      ok: result.networkCalls === 0,
      networkCalls: result.networkCalls,
      count: Array.isArray(result.value) ? result.value.length : 0,
      traces: Array.isArray(result.value) ? result.value.map(map) : [],
      error: null,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      networkCalls: 0,
      count: 0,
      traces: [],
      error: { code: 'fixture_execution_error', type: error?.name || 'Error' },
    };
  }
}

function unique(values) {
  return [...new Set(values)];
}

function run() {
  const sets = [
    runSet('active-single-draft-development', product.run, productTrace),
    runSet('factual-relationship-development', relations.run, relationTrace),
    runSet('relationship-risk-development', relationshipProbes.run, relationshipTrace),
  ];
  const traces = sets.flatMap((set) => set.traces);
  const occupations = unique(traces.map((trace) => trace.occupation));
  const languages = unique(traces.map((trace) => trace.language));
  const technicalBlocked = sets.some((set) => !set.ok || set.error);
  const allSemanticUnassessed = traces.every((trace) => trace.semanticStatus === 'unassessed');

  return {
    gate: VERSION,
    purpose: 'Technical integrity and redacted stage trace for fictional offline fixtures.',
    qualityDecision: 'not_evaluated',
    decision: technicalBlocked ? 'technical_blocked' : 'review_required',
    semanticStatusPolicy: 'unassessed',
    providerCalls: 0,
    networkCalls: sets.reduce((sum, set) => sum + set.networkCalls, 0),
    contract: {
      rawTextOutput: false,
      secretsAccepted: false,
      sourceToProposalToRetainedTrace: true,
      previewExportTrace: 'not_implemented',
      separateFrozenHoldout: false,
      humanReview: 'required_before_quality_claim',
      semanticCertification: false,
    },
    thresholds: {
      minimumDevelopmentCases: 1,
      requiredLanguages: ['en', 'ar'],
      requiredSeparateFrozenHoldout: true,
      requiredPreviewExportComparison: true,
      requiredHumanReview: true,
    },
    coverage: {
      cases: traces.length,
      occupations,
      languages,
      allSemanticUnassessed,
      fixtureSets: sets.map(({ name, ok, count, networkCalls, error }) => ({ name, ok, count, networkCalls, error })),
    },
    traces,
    limitations: [
      'Fixtures are fictional and hand-authored; they are not provider outputs.',
      'The gate does not judge factual truth, job relevance, writing quality, or PDF quality.',
      'Development probes are not a separate frozen holdout and cannot establish production rates.',
      'Preview/export parity and independent human review remain required before any quality claim.',
    ],
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(), null, 2));
}

module.exports = { HASH, run, textMeta };
