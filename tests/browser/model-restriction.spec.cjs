// Offline app-path acceptance, NOT a model response or a writing-quality verdict.
const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { load } = require('../helpers/editorial-loader.cjs');
const { createSampleProfile } = load('mock/profile');

const ORIGIN = 'http://127.0.0.1:4187';
const PROVIDER_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
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
      if ([PROVIDER_URL, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'].includes(url) && request.method() === 'POST') {
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
  await expect(page.getByText('Single-draft preview · Gemini 3.8 Flash · experimental', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Job description', { exact: true }).fill(job);
  await page.getByRole('button', { name: 'Tailor CV', exact: true }).click();
}

test('blocked output preserves original', async ({page,sc1Harness}) => {
 sc1Harness.respond(()=>({body:{candidates:[{finishReason:'SAFETY',finishMessage:'PRIVATE_SENTINEL'}]}}));
 const original=await seed(page,sourceProfile());
 await expect(page.getByText(/On HTTP 500, 502, 503, 504 or an output-limit \(MAX_TOKENS\) response/)).toBeVisible();
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

test('an unfinished degree is not silently presented as completed', async ({page,sc1Harness}) => {
 const p=sourceProfile();
 Object.assign(p.education.data[0],{degree:'Bachelor degree in progress',institution:'Fictional University',startDate:'',endDate:'',graduationDate:'',description:'',gpa:'',honors:[]});
 p.education.data=p.education.data.slice(0,1);
 sc1Harness.respond(()=>{
  const document={summarySegments:[
   {text:'Earned a bachelor degree.',sourceIds:['education_1']},
   {text:'Pursuing a bachelor degree.',sourceIds:['education_1']},
  ],entries:[],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await page.getByText(/Content review notes/).click();
 await expect(page.getByRole('region',{name:'CV tailoring inputs'}).getByText(/cited degree is explicitly in progress/)).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.summary.data).toBe('Pursuing a bachelor degree.');
 expect(copy.education).toEqual(original.education);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('mixed-script job text does not auto-add omitted skills', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.skills.isLocked=false;
 p.skills.data=[
  {id:crypto.randomUUID(),name:'SaaS',category:'Technical',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Technical Documentation',category:'Technical',level:''},
  {id:crypto.randomUUID(),name:'PHP',category:'Technical',level:''},
 ];
 const job='لا نحتاج إلى SaaS أو technical documentation لهذا المنصب. العمل يشمل PHP.';
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0],id=e.bulletIds[0],fact=packet.source.evidence.find(x=>x.id===id);
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:[id]}]}],skillSelections:[{id:'skill_3',category:'Technical'}]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,job);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 const state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.skills.data.map(x=>x.name)).toEqual(['PHP']);
 expect(copy.experience).toEqual(original.experience);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('current comparison pairs entries and labels exact-text differences without changing resumes', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets=[
  {id:crypto.randomUUID(),text:'Built internal data dashboards for a classroom exercise.',isVerified:true},
  {id:crypto.randomUUID(),text:'Wrote technical documentation for internal users.',isVerified:true},
  {id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true},
 ];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Developed internal data dashboards for a classroom exercise.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized weekly team meetings.',sourceIds:[e.bulletIds[2]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 await saved(page);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 await page.getByText('Compare current experience and projects',{exact:true}).click();
 await expect(page.getByText(/A reworded bullet may preserve the same meaning/)).toBeVisible();
 const pair=page.getByRole('article',{name:'Experience comparison 1'}),source=pair.getByRole('region',{name:'Current source'}),tailored=pair.getByRole('region',{name:'Current tailored copy'});
 await expect(source.getByText('Built internal data dashboards for a classroom exercise.')).toBeVisible();
 await expect(tailored.getByText('Developed internal data dashboards for a classroom exercise.')).toBeVisible();
 const flagged=source.getByText('No exact text match in current tailored bullets');
 await expect(flagged).toHaveCount(2);
 await expect(source.getByRole('listitem').filter({hasText:'Organized weekly team meetings.'}).getByText('No exact text match in current tailored bullets')).toHaveCount(0);
 if(process.env.CV_COMPARE_SCREENSHOT_DIR){
  await fs.mkdir(process.env.CV_COMPARE_SCREENSHOT_DIR,{recursive:true});
  const capture = async (section, name) => {
   await section.evaluate(el => { const scroll=el.closest('.tailor-scroll'); const r=el.getBoundingClientRect(), s=scroll.getBoundingClientRect(); scroll.scrollTop += r.top-s.top-8; });
   await page.screenshot({path:process.env.CV_COMPARE_SCREENSHOT_DIR+'/comparison-'+name+'.png'});
  };
  await capture(source,'desktop-source');
  await capture(tailored,'desktop-copy');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'CV Tailor',exact:true}).click();
  await capture(source,'mobile-source');
  await capture(tailored,'mobile-copy');
  await page.setViewportSize({width:1600,height:1000});
 }
 await page.reload();await saved(page);
 await page.getByText('Compare current experience and projects',{exact:true}).click();
 await expect(page.getByRole('article',{name:'Experience comparison 1'}).getByText('Wrote technical documentation for internal users.')).toBeVisible();
 state=await stored(page);expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 // Simulate a later source edit: the live comparison must never imply a frozen snapshot.
 const changed=state.profiles.map(x=>x.profileId===original.profileId?{...x,experience:{...x.experience,data:x.experience.data.map((e,i)=>i?e:{...e,bullets:e.bullets.map((b,j)=>j?b:{...b,text:'Later source edit for comparison.'})})}}:x);
 await page.evaluate(async({profiles,key})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put(profiles,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },{profiles:changed,key:PROFILE_KEY});
 await page.reload();await saved(page);await page.getByText('Compare current experience and projects',{exact:true}).click();
 await expect(page.getByRole('article',{name:'Experience comparison 1'}).getByText('Later source edit for comparison.')).toBeVisible();
 // If a source is removed later, the UI must explain that comparison is unavailable.
 state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 await page.evaluate(async({profiles,key})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('keyval-store',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('keyval','readwrite');tx.objectStore('keyval').put(profiles,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },{profiles:[copy],key:PROFILE_KEY});
 await page.reload();await saved(page);
 await expect(page.getByText(/The source resume is not available, so a current comparison cannot be displayed/)).toBeVisible();
 await expect(page.getByText('Compare current experience and projects',{exact:true})).toHaveCount(0);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('changed signed result restores original while retaining an independent edit', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets[0].text='Reported an operating margin of -5%.';
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Reported an operating margin of 5%.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page);await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();
 await saved(page);await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reported an operating margin of -5%.','Organized team meetings weekly.']);
 expect(copy.compositionReview.notes.some(x=>x.includes('sign associated with a numeric value may have changed'))).toBe(true);
 await page.reload();await saved(page);
 state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reported an operating margin of -5%.','Organized team meetings weekly.']);
 expect(copy.compositionReview.notes.some(x=>x.includes('sign associated with a numeric value may have changed'))).toBe(true);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('explicit programming context keeps omitted native language skills without inventing experience', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);p.skills.isLocked=false;
 p.skills.data=[
  {id:crypto.randomUUID(),name:'Python',category:'Languages',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Java',category:'Technical',level:'Beginner'},
  {id:crypto.randomUUID(),name:'PHP',category:'Technical',level:''},
 ];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0], fact=packet.source.evidence.find(x=>x.id===e.bulletIds[0]);
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:[e.bulletIds[0]]}]}],skillSelections:[{id:'skill_3',category:'Technical'}]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'Software engineer role: Build software using Python and support Java development for internal applications.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();await saved(page);
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience).toEqual(original.experience);
 expect(copy.skills.data.map(x=>x.name)).toEqual(['PHP','Python','Java']);
 expect(copy.skills.data[1]).toEqual(original.skills.data[0]);expect(copy.skills.data[2]).toEqual(original.skills.data[1]);
 expect(copy.compositionReview.notes.filter(x=>x.includes('literal match'))).toHaveLength(2);
 await page.reload();await saved(page);
 state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.skills.data.map(x=>x.name)).toEqual(['PHP','Python','Java']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('required skills list retains omitted native skills without inventing qualifications', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);p.skills.isLocked=false;
 p.skills.data=[
  {id:crypto.randomUUID(),name:'Accounting',category:'Technical',level:'Coursework only'},
  {id:crypto.randomUUID(),name:'Bookkeeping',category:'Technical',level:'Beginner'},
  {id:crypto.randomUUID(),name:'Excel',category:'Tools',level:''},
  {id:crypto.randomUUID(),name:'Budgeting',category:'Technical',level:''},
 ];
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0],fact=packet.source.evidence.find(x=>x.id===e.bulletIds[0]);
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[{text:fact.text,sourceIds:[e.bulletIds[0]]}]}],skillSelections:[{id:'skill_4',category:'Technical'}]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);
 await tailor(page,'Fictional operations role involving internal reporting.\nRequired skills: Accounting, Bookkeeping, Excel, Kubernetes.');
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();await saved(page);
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience).toEqual(original.experience);
 expect(copy.skills.data.map(x=>x.name)).toEqual(['Budgeting','Accounting','Bookkeeping','Excel']);
 expect(copy.skills.data.slice(1)).toEqual(original.skills.data.slice(0,3));
 expect(copy.compositionReview.notes.filter(x=>x.includes('literal match'))).toHaveLength(3);
 await page.reload();await saved(page);state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.skills.data.map(x=>x.name)).toEqual(['Budgeting','Accounting','Bookkeeping','Excel']);
 expect(sc1Harness.calls).toHaveLength(1);
});

test('reversed percentage direction restores the source and preserves another edit', async ({page,sc1Harness}) => {
 const p=sourceProfile(true);
 p.experience.data[0].bullets[0].text='Reduced processing costs by 20%.';
 p.experience.data[0].bullets.push({id:crypto.randomUUID(),text:'Organized weekly team meetings.',isVerified:true});
 sc1Harness.respond(packet=>{
  const e=packet.source.experience[0];
  const document={summarySegments:[],entries:[{id:e.id,overview:{text:'',sourceIds:[]},bullets:[
   {text:'Increased processing costs by 20%.',sourceIds:[e.bulletIds[0]]},
   {text:'Organized team meetings weekly.',sourceIds:[e.bulletIds[1]]},
  ]}],skillSelections:[]};
  return {body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(document)}]}}]}};
 });
 const original=await seed(page,p);await tailor(page);
 await expect(page.getByText('A new editable copy is open.',{exact:false})).toBeVisible();await saved(page);
 await expect.poll(async()=>(await stored(page)).profiles.length).toBe(2);
 let state=await stored(page),copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reduced processing costs by 20%.','Organized team meetings weekly.']);
 expect(copy.compositionReview.notes.some(x=>x.includes('percentage direction may have changed'))).toBe(true);
 await page.reload();await saved(page);state=await stored(page);copy=state.profiles.find(x=>x.profileId===state.activeId);
 expect(state.profiles.find(x=>x.profileId===original.profileId)).toEqual(original);
 expect(copy.experience.data[0].bullets.map(x=>x.text)).toEqual(['Reduced processing costs by 20%.','Organized team meetings weekly.']);
 expect(copy.compositionReview.notes.some(x=>x.includes('percentage direction may have changed'))).toBe(true);
 expect(sc1Harness.calls).toHaveLength(1);
});


test('HTTP 505 explains protocol failure and preserves the source offline', async ({page,sc1Harness}) => {
 sc1Harness.respond(()=>({status:505,body:{error:{message:'PRIVATE_PROVIDER_SENTINEL'}}}));
 const original=await seed(page,sourceProfile());
 await tailor(page);
 await expect(page.getByText(/HTTP 505/)).toBeVisible();
 await expect(page.getByText(/rejected the HTTP protocol version/)).toBeVisible();
 await expect(page.getByText('PRIVATE_PROVIDER_SENTINEL')).toHaveCount(0);
 expect(sc1Harness.calls).toHaveLength(1);
 expect(await stored(page)).toEqual({profiles:[original],activeId:original.profileId});
});


test('HTTP 504 synthetic failure keeps the original and shows no provider text', async ({page,sc1Harness}) => {
 sc1Harness.respond(()=>({status:504,body:{error:{code:504,message:'PRIVATE_PROVIDER_SENTINEL'}}}));
 const original=await seed(page,sourceProfile());
 await expect(page.getByText(/On HTTP 500, 502, 503, 504 or an output-limit/)).toBeVisible();
 await expect(page.getByText(/even if a request timed out/)).toBeVisible();
 await tailor(page);
 await expect(page.getByText(/HTTP 504/)).toBeVisible();
 await expect(page.getByText('PRIVATE_PROVIDER_SENTINEL')).toHaveCount(0);
 expect(sc1Harness.calls).toHaveLength(1);
 expect(await stored(page)).toEqual({profiles:[original],activeId:original.profileId});
});
