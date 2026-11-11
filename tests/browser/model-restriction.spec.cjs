// Offline app-path acceptance, NOT a model response or a writing-quality verdict.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const ORIGIN = 'http://127.0.0.1:4187';
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
const JOB = 'Software Engineer: build internal data dashboards, document delivery work and collaborate with the team. Classroom experience is acceptable.';
const NARRATIVE_SUMMARY = 'Software engineer with classroom experience building internal data dashboards.';
const GENERATED_SUMMARY = NARRATIVE_SUMMARY;
const EDITED_SUMMARY = 'Built internal data dashboards for a classroom exercise.';
const ERROR_503 = 'Google rejected the request (HTTP 503; UNAVAILABLE). Provider-reported details, not a verification of account usage. No automatic retry. Your resumes are unchanged.';
const PROFILE_KEY = 'cv-tailor-profiles-v2';
const ACTIVE_KEY = 'cv-tailor-active-id-v2';

function sourceProfile(summaryLocked = false) {
  const p = createSampleProfile('SC5 Offline Synthetic Source');
  p.documentTheme = { accentColor: '#2557a7', fontFamily: 'sans', fontSize: 'medium', lineSpacing: 'normal', layoutStyle: 'modern' };
  Object.assign(p.resumeHeader.data, { name: 'Fictional Sample', firstName: 'Fictional', lastName: 'Sample', desiredJobPosition: 'Software Engineer', email: 'SC5_PRIVATE_CONTACT@example.invalid', phone: '', linkedin: '', github: '', portfolio: '' });
  p.resumeHeader.isLocked = true;
  p.headline.data = 'Software Engineer';
  p.summary.data = 'Fictional software engineer supporting web application delivery.';
  p.summary.isLocked = summaryLocked;
  p.experience.isLocked = !summaryLocked;
  p.experience.data = [{ id: crypto.randomUUID(), roleTitle: 'Software Engineer', companyName: 'Fictional Classroom', city: '', startDate: 'Jan 2024', endDate: 'Jun 2024', description: '', bullets: [{ id: crypto.randomUUID(), text: EDITED_SUMMARY, isVerified: true }] }];
  p.projects.data = [];
  p.projects.isLocked = true;
  p.skills.data = [{ id: crypto.randomUUID(), name: 'Python', category: 'Technical', level: 'Coursework only' }];
  p.skills.isLocked = true;
  p.education.isLocked = true;
  p.certifications.isLocked = true;
  return p;
}

const test = base.extend({
  sc1Harness: async ({ context }, use) => {
    const calls = [], external = [], pageErrors = [];
    let reply = () => { throw new Error('No synthetic provider response configured'); };
    const observePage = page => page.on('pageerror', error => pageErrors.push(error.message));
    context.pages().forEach(observePage);
    context.on('page', observePage);
    await context.routeWebSocket('**/*', socket => {
      const origin = new URL(socket.url()).origin;
      // Vite's client may still attempt its loopback websocket with HMR disabled.
      // Close it locally; only non-loopback attempts violate external isolation.
      if (origin !== 'ws://127.0.0.1:4187') external.push(origin);
      socket.close();
    });
    // Mock exactly the intended endpoint; fail closed for all other external traffic.
    await context.route('**/*', async route => {
      const request = route.request(), url = request.url();
      if (new URL(url).origin === ORIGIN) return route.continue();
      if ([PROVIDER_URL, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'].includes(url) && request.method() === 'POST') {
        const body = request.postDataJSON();
        calls.push({ url, body, headers: request.headers() });
        try {
          const response = await reply(JSON.parse(body.contents[0].parts[0].text));
          return route.fulfill({ status: response.status ?? 200, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGIN }, body: JSON.stringify(response.body) });
        } catch (error) {
          pageErrors.push(error.message);
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
      }
      external.push(new URL(url).origin);
      return route.abort('blockedbyclient');
    });
    await use({ calls, respond: fn => { reply = fn; } });
    expect(external, 'No unexpected external requests may escape the offline harness').toEqual([]);
    expect(pageErrors, 'The real application must not raise browser errors').toEqual([]);
  },
});

async function stored(page) {
  return page.evaluate(async ({ profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction('keyval', 'readonly'), store = transaction.objectStore('keyval');
      const read = key => new Promise((resolve, reject) => { const r = store.get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const [profiles, activeId] = await Promise.all([read(profileKey), read(activeKey)]);
      return { profiles, activeId };
    } finally { db.close(); }
  }, { profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
}
async function saved(page) { await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible(); }
async function seed(page, source) {
  await page.goto('/');
  await saved(page);
  await page.evaluate(async ({ source, profileKey, activeKey }) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('keyval-store', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval');
        store.put([source], profileKey); store.put(source.profileId, activeKey); store.put(source.documentTheme, 'cv-tailor-builder-theme-v1');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { source, profileKey: PROFILE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await expect(page.getByLabel('Resume document name')).toHaveValue(source.profileName);
  await saved(page);
  return (await stored(page)).profiles[0]; // Snapshot after the REAL loader's normalization.
}
async function tailor(page, job = JOB) {
  await expect(page.getByText('Single-draft preview · Gemini 3.5 Flash-Lite · experimental', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Job description', { exact: true }).fill(job);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
}

test('blocked output preserves original', async ({page,sc1Harness}) => {
 sc1Harness.respond(()=>({body:{candidates:[{finishReason:'SAFETY',finishMessage:'PRIVATE_SENTINEL'}]}}));
 const original=await seed(page,sourceProfile());
 await expect(page.getByText(/On HTTP 503 or an output-limit \(MAX_TOKENS\) response/)).toBeVisible();
 await tailor(page);
 await expect(page.getByText(/Google blocked or restricted the request or response/)).toBeVisible();
 await expect(page.getByText('PRIVATE_SENTINEL')).toHaveCount(0);
 expect(sc1Harness.calls).toHaveLength(1);
 expect(await stored(page)).toEqual({profiles:[original],activeId:original.profileId});
});

test('multi-citation review is visible without changing the source', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Documented classroom delivery workflows.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0], first=e.bulletIds[0];
  const fact=packet.source.evidence.find(x=>x.id===first);
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:e.bulletIds}]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/this line repeats one cited passage while also citing others/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual([original.experience.data[0].bullets[0].text]);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('planned work is not silently promoted to completed work', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets[0].text='Planned to deploy web applications.';
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Deployed web applications.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/planned or intended action may have been presented as completed/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Planned to deploy web applications.','Organized team meetings weekly.']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('internal redaction markers do not appear in generated summary', async ({page,sc1Harness}) => {
 const p=sourceProfile();
 p.customSections=[{id:crypto.randomUUID(),title:'VOLUNTEERING',kind:'text',paragraphs:['Mentored students. Materials: https://fictional.invalid/methods.']}];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[
   {text:'Software Engineer mentoring students [link omitted].',sourceIds:['headline','context_1']},
   {text:'Software engineer with classroom experience building internal data dashboards.',sourceIds:['headline',e.bulletIds[0]]},
  ],entries:[],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/internal redaction marker/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.summary.data).toBe('Software engineer with classroom experience building internal data dashboards.');
 expect(copy.summary.data).not.toContain('[link omitted]');
 expect(sc1Harness.calls).toHaveLength(1);
});

test('an omitted exact C++ skill remains in the tailored copy with its qualification', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.skills.isLocked=false;
 p.skills.data=[{id:crypto.randomUUID(),name:'C++',category:'Languages',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Watercolor Painting',category:'Soft',level:''}];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0],id=e.bulletIds[0],fact=packet.source.evidence.find(x=>x.id===id);
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:[id]}]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'Software engineer: C++ required for developing applications and documenting delivery work.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/Kept your existing skill “C\+\+”/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.skills.data).toEqual([original.skills.data[0]]);
 expect(copy.experience).toEqual(original.experience);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('sparse source gets evidence-proportional summary guidance in the actual app request', async ({page,sc1Harness}) => {
 const p=sourceProfile();
 p.summary.data='';p.experience.isLocked=false;
 p.experience.data[0].bullets=[{id:crypto.randomUUID(),text:'Reviewed incident trends for operations teams in weekly reports.',isVerified:true}];
 p.education.data=[];p.certifications.data=[];p.projects.data=[];
 const summary='Software Engineer with experience reviewing incident trends for operations teams.';
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0],id=e.bulletIds[0],fact=packet.source.evidence.find(x=>x.id===id);
  expect(packet.guide.primaryFactIds).toEqual([id]);
  expect(packet.guide.qualificationFactIds).toEqual([]);
  const document={summarySegments:[{text:summary,sourceIds:['headline',id]}],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:[id]}]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'Operations role: review incident trends and prepare accurate weekly reports for teams.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.summary.data).toBe(summary);
 expect(sc1Harness.calls).toHaveLength(1);
 const instructions=sc1Harness.calls[0].body.systemInstruction.parts[0].text;
 expect(instructions).toContain('a single supported fact is enough');
 expect(instructions).not.toContain('MUST combine and cite at least TWO distinct IDs');
});

test('a reversed numeric range is restored without discarding an independent rewrite', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets=[
  {id:crypto.randomUUID(),text:'Reduced time preparing reports from 8 to 3 hours.',isVerified:true},
  {id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true},
 ];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Reduced time preparing reports from 3 to 8 hours.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'Operations role: reduce reporting time and coordinate weekly team meetings.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/direction of a numeric range may have changed/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reduced time preparing reports from 8 to 3 hours.','Organized team meetings weekly.']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('Arabic negation is restored when a proposed edit drops the limitation', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets=[
  {id:crypto.randomUUID(),text:'اختبرت التطبيق ولم أنشره في الإنتاج.',isVerified:true},
  {id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true},
 ];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'اختبرت التطبيق ونشرته في الإنتاج.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'دور تقني لاختبار التطبيقات وتنسيق الاجتماعات الأسبوعية مع الفريق.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/a limitation in the cited wording may have been lost/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['اختبرت التطبيق ولم أنشره في الإنتاج.','Organized team meetings weekly.']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('Arabic numeric invention is restored without discarding an independent edit', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets[0].text='راجعت ٣ تقارير.';
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'راجعت ٨ تقارير.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/rewrite added.*does not mention/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['راجعت ٣ تقارير.','Organized team meetings weekly.']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('changed metric units restore original and preserve an independent edit', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets[0].text='Reduced processing time by 5 hours.';
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Reduced processing time by 5 days.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/unit associated with a numeric value may have changed/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reduced processing time by 5 hours.','Organized team meetings weekly.']);
 expect(sc1Harness.calls).toHaveLength(1);
});
