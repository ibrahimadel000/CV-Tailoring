// Fictional, manually authored provider responses. These trace category handling,
// not live model quality, the cause of a particular CV, or semantic correctness.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const { fixture } = require('./helpers/composer-editorial-v4-fixture.cjs');
const { prepareNaturalComposition, compileNaturalComposition } = load('services/resumeComposer/naturalDocument');
const { orderedSkillGroups } = load('components/builder/skillPresentation');
const job = 'Fictional operations role coordinating team schedules and records. Experience communicating with colleagues is useful.';

function setup(locked = false) {
  const profile = fixture();
  profile.skills.data = [
    { id: crypto.randomUUID(), name: 'MySQL', category: 'Soft', level: 'Coursework only' },
    { id: crypto.randomUUID(), name: 'Project Management', category: 'Soft', level: '' },
    { id: crypto.randomUUID(), name: 'HTML', category: 'Technical', level: '' },
  ];
  profile.skills.isLocked = locked;
  const source = prepareNaturalComposition(profile, job).source;
  const facts = new Map(source.evidence.map(f => [f.id, f.text]));
  const response = {
    summarySegments: [],
    entries: source.experience.map(entry => ({
      id: entry.id,
      overview: { text: '', sourceIds: [] },
      bullets: entry.bulletIds.map(id => ({ text: facts.get(id), sourceIds: [id] })),
    })),
    skillSelections: locked ? [] : [
      { id: 'skill_1', category: 'Technical' },
      { id: 'skill_2', category: 'Soft' },
      { id: 'skill_3', category: 'Languages' },
    ],
  };
  return { profile, response };
}

test('fictional selected categories and the narrow local regrouping reach display without changing source skills', () => {
  const { profile, response } = setup();
  const before = JSON.stringify(profile);
  const result = compileNaturalComposition(profile, response, job);
  const skills = result.candidate.skills.data;
  assert.equal(JSON.stringify(profile), before);
  assert.deepEqual(skills.map(s => [s.name, s.level, s.category]), [
    ['MySQL', 'Coursework only', 'Technical'],
    ['Project Management', '', 'Technical'],
    ['HTML', '', 'Languages'],
  ]);
  assert(result.warnings.some(w => w.message.includes('Project Management') && w.message.includes('rather than Soft')));
  assert.deepEqual(orderedSkillGroups(skills).map(g => [g.category, g.items.map(s => s.name)]), [
    ['Technical', ['MySQL', 'Project Management']],
    ['Languages', ['HTML']],
  ]);
  assert.equal(result.semanticStatus, 'unassessed');
});

test('a locked skills section retains its original categories, names, order and qualifications', () => {
  const { profile, response } = setup(true);
  const before = JSON.stringify(profile);
  const result = compileNaturalComposition(profile, response, job);
  assert.deepEqual(result.candidate.skills, profile.skills);
  assert.equal(JSON.stringify(profile), before);
});
