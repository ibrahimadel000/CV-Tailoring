// Fictional offline regression tests; these do not validate model quality.
const { test } = require('node:test');
const a = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const { fixture, job } = require('./helpers/composer-editorial-v4-fixture.cjs');
const n = load('services/resumeComposer/naturalDocument');
const d = load('services/resumeComposer/singleDraftRequest');
const { summarizeProposal, summarizeChanges } = load('services/resumeComposer/changeSummary');

function setup() {
  const p = fixture();
  p.experience.data[0].bullets[0].text = 'Reviewed inventory records with warehouse colleagues.';
  p.experience.data[0].bullets[1].text = 'Prepared training materials for museum guides.';
  p.experience.data[0].bullets[2].text = 'Sorted fragile exhibits under supervision.';
  p.skills.data = [
    { id: crypto.randomUUID(), name: 'Inventory Records', category: 'Technical', level: '' },
    { id: crypto.randomUUID(), name: 'Python', category: 'Languages', level: 'Coursework only' },
  ];
  return p;
}

test('summary schema removes skill-only IDs when other citation IDs exist without losing skill selection', () => {
  const p = setup(), packet = n.prepareNaturalComposition(p, job), { wire, responseSchema } = d.prepareSingleDraftRequest(packet), w = JSON.parse(wire);
  a.deepEqual(w.guide.skillListOnlyIds, ['skill_2']);
  a.deepEqual(w.guide.skillSupportFactIds, { skill_1: ['work_1_b1'] });
  const ids = responseSchema.properties.summarySegments.items.properties.sourceIds.items.enum;
  a(ids.includes('work_1_b1')); a(ids.includes('skill_1')); a(!ids.includes('skill_2'));
  a.deepEqual(responseSchema.properties.skillSelections.items.properties.id.enum, ['skill_1', 'skill_2']);
  a.equal(w.source.evidence.find(x => x.id === 'skill_2').text, packet.source.evidence.find(x => x.id === 'skill_2').text);
});

test('literal occurrence in unrelated or negated text is only a hint, not proof of experience', () => {
  const p = setup(); p.experience.data[0].bullets[0].text = 'Did not use Python in this role.';
  const packet = n.prepareNaturalComposition(p, job), w = JSON.parse(d.prepareSingleDraftRequest(packet).wire);
  a(!w.guide.skillListOnlyIds.includes('skill_2'));
  a.deepEqual(w.guide.skillSupportFactIds.skill_2, ['work_1_b1']);
  a.match(d.singleDraftInstructions, /only a literal hint, not proof/);
});

test('summary and entries locks are respected with new guide', () => {
  const p = setup(); p.summary.isLocked = true; p.experience.isLocked = true;
  const q = d.prepareSingleDraftRequest(n.prepareNaturalComposition(p,job));
  a.equal(q.responseSchema.properties.summarySegments.maxItems, 0);
  a.deepEqual(JSON.parse(q.wire).guide.entryBulletIds, []);
});

test('unbacked technology does not silently survive an entry rewrite', () => {
  const p = setup(), packet = n.prepareNaturalComposition(p, job), s = packet.source;
  const authored = {
    summarySegments: [],
    entries: s.experience.map(e => ({
      id: e.id,
      overview: { text: '', sourceIds: [] },
      bullets: e.bulletIds.map(id => ({ text: s.evidence.find(f => f.id === id).text, sourceIds: [id] })),
    })),
    skillSelections: [],
  };
  authored.entries[0].bullets[0] = { text: 'Coordinated Python inventory records.', sourceIds: ['work_1_b1'] };
  const out = n.compileNaturalComposition(p, authored, job);
  a(!out.candidate.experience.data[0].bullets.some(b => b.text === 'Coordinated Python inventory records.'));
  a(out.warnings.length);
});

test('mid-sentence capitalized action verbs are not exempted by sentence-start verb rules', () => {
  const p = setup(), packet = n.prepareNaturalComposition(p, job), s = packet.source;
  for (const midSentenceInvention of [
    'Reviewed inventory records for Managed Warehouse colleagues.',
    'Reviewed Integrated Inventory records with warehouse colleagues.',
    'Prepared training materials for Accelerated Museum guides.',
    'Reviewed inventory records with Managed colleagues.',
  ]) {
    const authored = {
      summarySegments: [],
      entries: s.experience.map(e => ({
        id: e.id,
        overview: { text: '', sourceIds: [] },
        bullets: e.bulletIds.map(id => ({ text: s.evidence.find(f => f.id === id).text, sourceIds: [id] })),
      })),
      skillSelections: [],
    };
    authored.entries[0].bullets[0] = { text: midSentenceInvention, sourceIds: ['work_1_b1', 'work_1_b2'] };
    const out = n.compileNaturalComposition(p, authored, job);
    a(
      !out.candidate.experience.data[0].bullets.some(b => b.text === midSentenceInvention),
      `mid-sentence capitalized verb phrase must be rejected: ${midSentenceInvention}`,
    );
  }
});

test('active-voice fictional bullets tightened via outcome and clause front-loading compile cleanly while unsafe claims are rejected', () => {
  const p = setup();
  p.resumeHeader.data.desiredJobPosition = 'Archive Coordinator';
  p.headline.data = 'Archive Coordinator';
  p.experience.data[0].bullets = [
    {
      id: crypto.randomUUID(),
      text: 'Cataloged rare manuscripts and archival records, ensuring seamless coordination between conservation workflows and daily reading-room requests.',
      isVerified: true,
    },
    {
      id: crypto.randomUUID(),
      text: 'Aligned clinic schedules with laboratory equipment maintenance through proactive planning and cross-team coordination.',
      isVerified: true,
    },
    {
      id: crypto.randomUUID(),
      text: 'Prepared training materials for museum guides under supervision without altering curatorial catalogs, improving tour consistency.',
      isVerified: true,
    },
  ];
  p.skills.data = [
    { id: crypto.randomUUID(), name: 'Archival Records', category: 'Technical', level: '' },
    { id: crypto.randomUUID(), name: 'Conservation Audit', category: 'Technical', level: '' },
  ];

  const packet = n.prepareNaturalComposition(p, job);
  const authored = {
    summarySegments: [
      {
        text: 'Archive Coordinator experienced in cataloging rare manuscripts and archival records while coordinating laboratory equipment maintenance and clinic schedules.',
        sourceIds: ['headline', 'work_1_b1', 'work_1_b2'],
      },
    ],
    entries: [
      {
        id: 'work_1',
        overview: { text: '', sourceIds: [] },
        bullets: [
          {
            text: 'Cataloged rare manuscripts and archival records to coordinate conservation workflows with daily reading-room requests.',
            sourceIds: ['work_1_b1'],
          },
          {
            text: 'Coordinated laboratory equipment maintenance and cross-team planning to align clinic schedules.',
            sourceIds: ['work_1_b2'],
          },
          {
            text: 'Improved tour consistency by preparing training materials for museum guides under supervision without altering curatorial catalogs.',
            sourceIds: ['work_1_b3'],
          },
        ],
      },
    ],
    skillSelections: [{ id: 'skill_1', category: 'Technical' }],
  };

  const out = n.compileNaturalComposition(p, authored, job);
  const proposal = summarizeProposal(packet.source, authored);
  const changes = summarizeChanges(p, out.candidate);
  a.equal(proposal.proposed, 3);
  a.equal(proposal.different, 3);
  a.equal(changes.experience, 'edited');
  a.equal(out.guardNotes.filter(note => note.kind === 'restored' || note.kind === 'removed').length, 0);
  a.equal(out.summaryRemovals.length, 0);

  // Rejects unsupported sentence-initial seniority/specialization prefix on role title
  for (const badSummary of [
    'Senior Archive Coordinator experienced in cataloging rare manuscripts and archival records.',
    'Experienced Archive Coordinator cataloging rare manuscripts and archival records.',
  ]) {
    const raw = JSON.parse(JSON.stringify(authored));
    raw.summarySegments = [{ text: badSummary, sourceIds: ['headline', 'work_1_b1'] }];
    const badOut = n.compileNaturalComposition(p, raw, job);
    a.notEqual(badOut.candidate.summary.data, badSummary);
  }

  // Rejects skillListOnlyIds label ("Conservation Audit") even in lowercase inside summary or bullet
  {
    const raw = JSON.parse(JSON.stringify(authored));
    raw.summarySegments = [{
      text: 'Archive Coordinator experienced in cataloging rare manuscripts and conservation audit workflows.',
      sourceIds: ['headline', 'work_1_b1'],
    }];
    const badOut = n.compileNaturalComposition(p, raw, job);
    a.equal(badOut.summaryRemovals.length, 1);
  }

  // Rejects dropped supervision or negation on bullet 3
  for (const unsafeScope of [
    'Improved tour consistency by preparing training materials for museum guides without altering curatorial catalogs.',
    'Improved tour consistency by preparing training materials for museum guides under supervision altering curatorial catalogs.',
  ]) {
    const raw = JSON.parse(JSON.stringify(authored));
    raw.entries[0].bullets[2] = { text: unsafeScope, sourceIds: ['work_1_b3'] };
    const badOut = n.compileNaturalComposition(p, raw, job);
    a.equal(badOut.candidate.experience.data[0].bullets[2].text, p.experience.data[0].bullets[2].text);
  }
});
