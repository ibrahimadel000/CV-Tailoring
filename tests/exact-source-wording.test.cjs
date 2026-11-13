// Synthetic offline tests: no provider, network or factual validation.
const { test } = require('node:test');
const a = require('node:assert/strict');
const { load } = require('./helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');
const { cvProfileSchema } = load('types/schema');
const { validateDraft } = load('services/contentEngine/engine');
const { createCompositionRunner } = load('services/resumeComposer/workflow');
const { compileNaturalComposition } = load('services/resumeComposer/naturalDocument');
const job = 'Archive assistant: organize records, prepare materials and coordinate daily tasks for colleagues.';
const clone = x => JSON.parse(JSON.stringify(x));
const bullet = text => ({ id: crypto.randomUUID(), text, isVerified: true });

function fixture() {
  const p = createSampleProfile('Exact source fixture');
  p.summary.data = '  ملخص عربي\n\n  Original summary with spacing.  ';
  p.experience.data = p.experience.data.slice(0, 1);
  Object.assign(p.experience.data[0], { description: '  Overview with exact whitespace.  ', bullets: [
    bullet('  أعددت الوثائق تحت إشراف المدير.  '), bullet('Reviewed records.'), bullet('Prepared visitor materials.'),
    bullet('  Coordinated schedules.\n  '), bullet('Filed paper copies.'), bullet('Supported meetings.'), bullet('  '),
  ] });
  const second = clone(p.experience.data[0]); second.id = crypto.randomUUID(); second.roleTitle = 'Records assistant';
  second.description = '  Second overview  '; second.bullets = [bullet('Kept records.')];
  p.experience.data.push(second);
  p.projects.data = p.projects.data.slice(0, 1);
  p.projects.data[0].bullets = [bullet('  كتب الدليل.  '), bullet('Maintained records.')];
  p.skills.data = p.skills.data.slice(0, 2); p.skills.data[0].name = 'Python'; p.skills.data[1].name = 'React';
  return p;
}
function response(packet) {
  const s = packet.source, facts = new Map(s.evidence.map(f => [f.id, f.text]));
  return {
    summarySegments: s.locks.summary || !s.summaryId ? [] : [{ text: facts.get(s.summaryId), sourceIds: [s.summaryId] }],
    entries: [...s.experience.filter(() => !s.locks.experience), ...s.projects.filter(() => !s.locks.projects)]
      .map(e => ({ id: e.id, overview: e.overviewId ? { text: facts.get(e.overviewId), sourceIds: [e.overviewId] } : { text: '', sourceIds: [] },
        bullets: e.bulletIds.map(id => ({ text: facts.get(id), sourceIds: [id] })) })),
    skillSelections: s.locks.skills ? [] : s.skillIds.map(id => ({ id, category: s.evidence.find(f => f.id === id).profileCategory })),
  };
}
function rig(p, provider) {
  let active = p, saves = 0, calls = 0, copy;
  const repo = { readActive: () => active, appendIfCurrent(snapshot, candidate) {
    if (JSON.stringify(active) !== snapshot) return false;
    saves++; copy = candidate; active = candidate; return true;
  } };
  return { repo, runner: createCompositionRunner(repo, async (packet, signal) => { calls++; return provider(packet, signal); }),
    get saves() { return saves; }, get calls() { return calls; }, get copy() { return copy; }, setActive(value) { active = value; } };
}
const signal = () => new AbortController().signal;
const options = { exactSourceWording: true };

test('preserves native text, metadata and entries while using only unambiguous surviving references', async () => {
  const p = fixture(), before = JSON.stringify(p);
  const r = rig(p, packet => {
    const doc = response(packet), first = doc.entries.find(e => e.id === 'work_1');
    const b = Object.fromEntries(first.bullets.map(x => [x.sourceIds[0], x]));
    first.bullets = [b.work_1_b4, b.work_1_b2, clone(b.work_1_b2),
      { text: 'Prepared visitor materials and filed paper copies.', sourceIds: ['work_1_b3', 'work_1_b5'] },
      { text: 'Unknown line.', sourceIds: ['unknown'] },
      { text: 'Overview with exact whitespace.', sourceIds: ['work_1_overview'] },
      { text: 'Uncited line.', sourceIds: [] }];
    // Returned entry order is not authoritative for native entry ordering.
    doc.entries.reverse();
    const project = doc.entries.find(e => e.id === 'project_1'); project.bullets.reverse();
    doc.summarySegments = [{ text: 'Invented 999 things.', sourceIds: ['work_1_b1'] }];
    return doc;
  });
  const out = await r.runner.run(job, signal(), options), copy = out.candidate;
  a.equal(out.status, 'created'); a.equal(r.calls, 1); a.equal(r.saves, 1);
  a.equal(JSON.stringify(p), before); a.deepEqual(copy.summary, p.summary);
  a.deepEqual(copy.experience.data.map(x => x.id), p.experience.data.map(x => x.id));
  a.deepEqual(copy.projects.data.map(x => x.id), p.projects.data.map(x => x.id));
  a.deepEqual(copy.experience.data[0].bullets, [p.experience.data[0].bullets[3], ...p.experience.data[0].bullets.filter((_, i) => i !== 3)]);
  a.deepEqual(copy.projects.data[0].bullets, [...p.projects.data[0].bullets].reverse());
  const expectedWork = clone(p.experience); expectedWork.data[0].bullets = copy.experience.data[0].bullets;
  const expectedProject = clone(p.projects); expectedProject.data[0].bullets = copy.projects.data[0].bullets;
  a.deepEqual(copy.experience, expectedWork); a.deepEqual(copy.projects, expectedProject);
  for (const k of ['education', 'certifications', 'customSections', 'headline', 'resumeHeader', 'documentTheme', 'sectionOrder']) a.deepEqual(copy[k], p[k]);
  a(cvProfileSchema.safeParse(copy).success); a.deepEqual(validateDraft(out.source, out.draft).issues, []);
  a.equal(out.draft.experience[0].omitted.length, 0); a.equal(out.draft.projects[0].omitted.length, 0);
  a(!out.omittedSourceIds.some(id => id.startsWith('work_') || id.startsWith('project_')));
  a.equal(copy.compositionChanges.summary, 'unchanged'); a.equal(copy.compositionChanges.experience, 'reordered');
  a.equal(copy.compositionChanges.projects, 'reordered'); a(!('proposal' in copy.compositionChanges));
  a.equal(out.summarySegments[0].text, p.summary.data.trim()); a.deepEqual(out.summaryRemovals, []);
  a(out.warnings.some(w => w.path === 'sourceWording' && /not factually verified/.test(w.message)));
  a(!out.warnings.some(w => /Removed a generated|not cited|kept your original wording/i.test(w.message)));
  a.equal(out.semanticStatus, 'unassessed');
});

test('unambiguous omissions append in source order; changed prose is never copied', async () => {
  const p = fixture(), r = rig(p, packet => {
    const doc = response(packet), entry = doc.entries[0];
    entry.bullets = [entry.bullets[3], entry.bullets[0]];
    // The model's unsupported proposal is discarded by compilation.
    doc.entries[1].bullets[0].text = 'Invented 999 records.';
    return doc;
  });
  const out = await r.runner.run(job, signal(), options);
  const old = p.experience.data[0].bullets;
  a.deepEqual(out.candidate.experience.data[0].bullets, [old[3], old[0], ...old.filter((_, i) => i !== 3 && i !== 0)]);
  a.deepEqual(out.candidate.experience.data[1], p.experience.data[1]);
  a(!out.candidate.experience.data.flatMap(e => e.bullets).some(b => b.text.includes('Invented 999 records.')));
  a(!out.warnings.some(w => /999|not cited/.test(w.message)));
});

test('skill selection and regrouping remain exactly as in normal compilation', async () => {
  const p = fixture(); let normal;
  const r = rig(p, packet => {
    const doc = response(packet); doc.skillSelections = [{ id: 'skill_2', category: 'Tools' }];
    normal = compileNaturalComposition(p, doc, job); return doc;
  });
  const out = await r.runner.run(job, signal(), options);
  a.deepEqual(out.candidate.skills, normal.candidate.skills);
  a.deepEqual(out.normalizations, normal.normalizations);
  a.deepEqual(out.draft.skillOrder, normal.draft.skillOrder);
  a.deepEqual(out.draft.omittedSkills, normal.draft.omittedSkills);
  a.deepEqual(out.omittedSourceIds, normal.draft.omittedSkills.map(x => x.sourceId));
  a.deepEqual(out.warnings.filter(w => w.path === 'skillSelections'), normal.warnings.filter(w => w.path === 'skillSelections'));
});

test('locks preserve native sections and leave unlocked project ordering possible', async () => {
  const p = fixture(); p.summary.isLocked = p.experience.isLocked = p.skills.isLocked = true;
  const r = rig(p, packet => { const doc = response(packet); doc.entries[0].bullets.reverse(); return doc; });
  const out = await r.runner.run(job, signal(), options);
  for (const k of ['summary', 'experience', 'skills']) a.deepEqual(out.candidate[k], p[k]);
  a.deepEqual(out.candidate.projects.data[0].bullets, [...p.projects.data[0].bullets].reverse());
  a.deepEqual(validateDraft(out.source, out.draft).issues, []);
});

test('unchanged source result makes no copy even when model suggested prose changes', async () => {
  const p = fixture(), before = JSON.stringify(p), r = rig(p, packet => {
    const doc = response(packet); doc.summarySegments = [{ text: 'Invented 999 things.', sourceIds: ['work_1_b1'] }];
    return doc;
  });
  const out = await r.runner.run(job, signal(), options);
  a.equal(out.status, 'unchanged'); a.equal(r.saves, 0); a.deepEqual(out.candidate, p); a.equal(JSON.stringify(p), before);
  a.equal(out.draft.experience[0].omitted.length, 0); a.deepEqual(out.summaryRemovals, []);
});

test('malformed provider output fails before saving in exact mode', async () => {
  const p = fixture(), r = rig(p, () => ({ summarySegments: [], entries: 'invalid', skillSelections: [] }));
  await a.rejects(r.runner.run(job, signal(), options), /malformed|incomplete/i); a.equal(r.saves, 0); a.equal(r.calls, 1);
});

for (const mode of ['stale', 'abort', 'cancel']) test(`${mode} cannot save a late exact-mode response`, async () => {
  const p = fixture(); let release;
  const r = rig(p, packet => new Promise(resolve => { release = () => resolve(response(packet)); }));
  const c = new AbortController(), task = r.runner.run(job, c.signal, options);
  if (mode === 'stale') r.setActive({ ...p, profileName: 'Changed' });
  if (mode === 'abort') c.abort();
  if (mode === 'cancel') r.runner.cancel();
  release();
  await a.rejects(task, e => e.code === (mode === 'stale' ? 'stale' : 'cancelled')); a.equal(r.saves, 0);
});

test('commit compare-and-append failure stops a reordered copy', async () => {
  const p = fixture(), r = rig(p, packet => { const doc = response(packet); doc.entries[0].bullets.reverse(); return doc; });
  r.repo.appendIfCurrent = () => false;
  await a.rejects(r.runner.run(job, signal(), options), e => e.code === 'stale'); a.equal(r.saves, 0);
});

test('default runner remains ordinary generative compilation', async () => {
  const p = fixture(), r = rig(p, packet => {
    const doc = response(packet);
    doc.entries[1].bullets[0].text = 'Maintained records.'; return doc;
  });
  const out = await r.runner.run(job, signal());
  a.equal(out.status, 'created'); a.equal(out.candidate.experience.data[1].bullets[0].text, 'Maintained records.');
  a(out.candidate.compositionChanges.proposal); a(!out.warnings.some(w => w.path === 'sourceWording'));
});

test('a compiled alternative can suggest order without contributing its rewritten wording', async () => {
  const p = fixture(); let normal;
  const r = rig(p, packet => {
    const doc = response(packet), primary = doc.entries[0];
    // Alternative entry selection requires an unchanged primary, identical overview,
    // full one-to-one coverage and at least one surviving edit.
    const alt = clone(primary); alt.bullets[1].text = 'Reviewed the records.'; alt.bullets.reverse();
    doc.alternativeEntries = [alt];
    normal = compileNaturalComposition(p, doc, job); return doc;
  });
  const out = await r.runner.run(job, signal(), options);
  a(normal.warnings.some(w => /alternative AI draft/.test(w.message)));
  const bullets = p.experience.data[0].bullets;
  a.deepEqual(out.candidate.experience.data[0].bullets, [...bullets.slice(0, 6).reverse(), bullets[6]]);
  a(!out.candidate.experience.data[0].bullets.some(b => b.text === 'Reviewed the records.'));
  a(!out.warnings.some(w => /alternative AI draft/.test(w.message)));
});

test('a source too large for the validated draft fails before a provider call without truncation', async () => {
  const p = fixture(); p.experience.data[0].bullets = Array.from({ length: 41 }, (_, i) => bullet(`Filed item ${i + 1}.`));
  const before = JSON.stringify(p);
  const r = rig(p, packet => { const doc = response(packet); doc.entries[0].bullets.pop(); return doc; });
  await a.rejects(r.runner.run(job, signal(), options), e => e.code === 'input');
  a.equal(r.calls, 0); a.equal(r.saves, 0); a.equal(JSON.stringify(p), before);
});

for (const initial of [true, false]) test(`mode is captured before the provider await (initial ${initial})`, async () => {
  const p=fixture(); let release;
  const r=rig(p, packet => new Promise(resolve => { release=()=>{
    const doc=response(packet);doc.entries[0].bullets.reverse();doc.entries[1].bullets[0].text='Maintained records.';resolve(doc);
  }; }));
  const mutable={exactSourceWording:initial};const task=r.runner.run(job,signal(),mutable);
  mutable.exactSourceWording=!initial;release();const out=await task;
  a.equal(out.status,'created');
  a.equal(out.candidate.experience.data[1].bullets[0].text,initial ? 'Kept records.' : 'Maintained records.');
  a.equal('proposal' in out.candidate.compositionChanges,!initial);
});
