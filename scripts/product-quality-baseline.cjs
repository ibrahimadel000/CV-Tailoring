'use strict';
// Offline fictional diagnostic of the ACTIVE single-draft pipeline.
// The responses per case are hand-authored, not model outputs. This script
// does not read keys, use fetch, judge semantics, or call an AI provider.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('../tests/helpers/editorial-loader.cjs');
const { fixture } = require('../tests/helpers/composer-editorial-v4-fixture.cjs');
const { prepareNaturalComposition, compileNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { prepareSingleDraftRequest, singleDraftInstructions } = load('services/resumeComposer/singleDraftRequest');
const { summarizeProposal } = load('services/resumeComposer/changeSummary');

// Everything here is invented for development. A source and a job are not a
// proof of work, nor is a job requirement evidence about the fictional person.
const CASES = [
  { id: 'care-en', occupation: 'care', language: 'en', role: 'Care assistant',
    job: 'Care assistant needed to support supervised patient mobility and accurate handover notes for the nursing team.',
    bullets: ['Assisted patient transfers under nurse supervision.', 'Recorded routine observations for the nursing team.'],
    risky: 'Led patient transfers independently.', skill: ['Patient care', 'Technical', 'Under supervision'] },
  { id: 'education-en', occupation: 'education', language: 'en', role: 'Teaching assistant',
    job: 'Teaching assistant to prepare classroom activities and support students during lessons under teacher direction.',
    bullets: ['Prepared classroom learning activities.', 'Supported students during lessons under teacher supervision.'],
    risky: 'Led the school-wide curriculum independently.', skill: ['Classroom support', 'Technical', 'Assistant level'] },
  { id: 'trade-en', occupation: 'trade', language: 'en', role: 'Electrical apprentice',
    job: 'Electrical apprentice to assist licensed electricians with fixture installation and follow site safety procedures.',
    bullets: ['Assisted a licensed electrician with fixture installation.', 'Followed site safety procedures during training.'],
    risky: 'Independently certified commercial electrical installations.', skill: ['Fixture installation', 'Technical', 'Apprentice level'] },
  { id: 'hospitality-en', occupation: 'hospitality', language: 'en', role: 'Restaurant host',
    job: 'Restaurant host to welcome guests, manage reservations and communicate service updates to the restaurant team.',
    bullets: ['Welcomed guests and organized table reservations.', 'Shared service updates with the restaurant team.'],
    risky: 'Managed restaurant finances and increased revenue by 50%.', skill: ['Guest service', 'Soft', ''] },
  { id: 'software-en', occupation: 'software', language: 'en', role: 'Junior developer',
    job: 'Backend developer to maintain web applications, document APIs and contribute to team reviews of proposed changes.',
    bullets: ['Documented API behavior for the developer team.', 'Built a reporting tool for a classroom project.'],
    risky: 'Built production APIs and led automated testing across the company.', skill: ['Python', 'Languages', 'Coursework only'] },
  { id: 'admin-ar', occupation: 'administration', language: 'ar', role: 'مساعد إداري',
    job: 'مطلوب مساعد إداري لتنظيم مواعيد الفريق وإعداد المستندات وتنسيق الاجتماعات اليومية مع الزملاء.',
    bullets: ['نظمت مواعيد الفريق وأعددت المستندات.', 'ساعدت في تنظيم الاجتماعات تحت إشراف المسؤول.'],
    risky: 'أدرت الإدارة بالكامل دون إشراف.', skill: ['تنظيم المواعيد', 'Technical', ''] },
];


// Intended faithful rewrites and subtler invented details for human review.
// Fixture labels are hypotheses, not semantic or safety verdicts.
const ADDITIONAL = {
  'care-en': { faithful: 'Helped with patient transfers under nurse supervision.', subtle: 'Assisted patient transfers under nurse supervision in the intensive care unit.' },
  'education-en': { faithful: 'Prepared learning activities for the classroom.', subtle: 'Prepared classroom learning activities for students with disabilities.' },
  'trade-en': { faithful: 'Helped a licensed electrician install fixtures.', subtle: 'Assisted a licensed electrician with fixture installation in commercial buildings.' },
  'hospitality-en': { faithful: 'Organized table reservations and welcomed guests.', subtle: 'Welcomed VIP guests and organized table reservations.' },
  'software-en': { faithful: 'Documented the behavior of APIs for the developer team.', subtle: 'Documented API behavior for the developer team and deployed the APIs.' },
  'admin-ar': { faithful: 'أعددت المستندات ونظمت مواعيد الفريق.', subtle: 'نظمت مواعيد الفريق وأعددت المستندات السرية.' },
};

function profileFor(c) {
  const p = fixture();
  p.profileName = `Fictional baseline ${c.id}`;
  p.resumeHeader.data.desiredJobPosition = c.role;
  p.headline.data = c.role;
  p.summary.data = '';
  p.experience.data = p.experience.data.slice(0, 1);
  Object.assign(p.experience.data[0], {
    roleTitle: c.role, companyName: 'Fictional organization', description: '',
    bullets: c.bullets.map(text => ({ id: crypto.randomUUID(), text, isVerified: true })),
  });
  p.projects.data = [];
  p.education.data = [];
  p.certifications.data = [];
  p.skills.data = [{ id: crypto.randomUUID(), name: c.skill[0], category: c.skill[1], level: c.skill[2] }];
  return p;
}
function responseFor(packet, c, variant) {
  const source = packet.source;
  const facts = new Map(source.evidence.map(f => [f.id, f.text]));
  return {
    summarySegments: [],
    entries: source.experience.map(entry => ({
      id: entry.id, overview: { text: '', sourceIds: [] },
      bullets: entry.bulletIds.map((id, i) => ({ text: i === 0 ? ({ 'scope-risk': c.risky, 'faithful': ADDITIONAL[c.id].faithful, 'subtle-risk': ADDITIONAL[c.id].subtle }[variant] || facts.get(id)) : facts.get(id), sourceIds: [id] })),
    })),
    skillSelections: [{ id: source.skillIds[0], category: c.skill[1] }],
  };
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function runCase(c, variant) {
  const profile = profileFor(c), original = JSON.stringify(profile);
  const packet = prepareNaturalComposition(profile, c.job);
  const request = prepareSingleDraftRequest(packet), wire = JSON.parse(request.wire);
  assert.equal(wire.job, c.job);
  assert.deepEqual(wire.source, packet.source);
  const raw = responseFor(packet, c, variant);
  let compiled, technical;
  try { compiled = compileNaturalComposition(profile, raw, c.job); technical = { status: 'compiled' }; }
  catch (error) { technical = { status: 'rejected', message: String(error.message).slice(0, 500) }; }
  assert.equal(JSON.stringify(profile), original, 'The source profile must not be mutated.');
  return {
    caseId: c.id, occupation: c.occupation, language: c.language, variant,
    origin: 'fictional input and hand-authored response; no provider call',
    source: { role: c.role, bullets: c.bullets, skill: c.skill }, job: c.job,
    promptSha256: digest(singleDraftInstructions), wireSha256: digest(request.wire),
    proposed: raw.entries[0].bullets.map(b => b.text),
    technical,
    retained: compiled ? compiled.candidate.experience.data[0].bullets.map(b => b.text) : null,
    selectedSkills: compiled ? compiled.candidate.skills.data.map(s => ({ name: s.name, level: s.level, category: s.category })) : null,
    reviewNotes: compiled ? compiled.warnings : [], proposalCounts: summarizeProposal(packet.source, raw),
    semanticStatus: 'unassessed',
    reviewRequired: 'Compare source, proposed and retained wording for scope, attribution, job relevance and omissions; no automatic quality verdict.',
  };
}
function run() { return CASES.flatMap(c => ['copy', 'faithful', 'scope-risk', 'subtle-risk'].map(variant => runCase(c, variant))); }
if (require.main === module) {
  const results = run();
  console.log(JSON.stringify({
    diagnostic: 'Active single-draft pipeline; fictional manually authored responses only',
    limitation: 'No AI request or semantic evaluation was performed. A guard retaining or restoring text is not a factuality or writing-quality verdict.',
    count: results.length, results,
  }, null, 2));
}
module.exports = { CASES, runCase, run };
