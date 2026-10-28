// Current-source regressions. Offline only; no provider, snapshot upload, or secrets.
const {test}=require('node:test'),a=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {fixture,job}=require('./helpers/composer-fixed-v6-fixture.cjs');
const engine=load('services/contentEngine/engine'),{originalSkillContext}=load('services/contentEngine/skillContext');
const {professionalContext}=load('services/tailorModel'),{buildImportedProfile}=load('services/cvImportModel');
const core=load('services/resumeComposer/core');
const snapshot=(text)=>{const p=fixture();p.importedFrom={sourceText:text};return p;};
const theme={accentColor:'#2557a7',fontFamily:'sans',fontSize:'medium',lineSpacing:'normal',layoutStyle:'modern'};
const parse=text=>buildImportedProfile({text,warnings:[]},'fictional.docx','docx',theme);
const extra=(title,paragraphs)=>({id:crypto.randomUUID(),title,kind:'text',paragraphs});
test('current source: Coursework label survives exact-skill context recovery',()=>{
 const p=snapshot('TECHNICAL SKILLS\nCoursework: Python, RESTful APIs\nPRIVATE NOTES\nBackend Development: Python');
 const before=JSON.stringify(p),ctx=originalSkillContext(p);
 a.deepEqual(ctx,[{sectionTitle:'TECHNICAL SKILLS',groupTitle:'Coursework',skillIds:['skill_1','skill_2']}]);a.equal(JSON.stringify(p),before);
});
test('current source: qualified skill heading is imported with its qualifier',()=>{
 const p=parse('Alex Morgan\nSoftware Engineer\nSKILLS (Coursework only)\nPython, SQL\nEDUCATION\nBSc Computing | Example University\n2020 - 2024');
 a.deepEqual(p.skills.data.map(x=>x.name),['Python','SQL']);
 a.equal(engine.projectSource(p).originalSkillContexts[0].sectionTitle,'SKILLS (Coursework only)');
});
test('current source: professional paragraph with a URL retains meaning without URL',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Delivered introductory workshops, not production implementation. Materials: https://private.example/path?token=SECRET_VALUE'])];
 const before=JSON.stringify(p),rows=professionalContext(p),wire=JSON.stringify(engine.projectSource(p));
 a.equal(rows.length,1);a.match(rows[0].text,/Delivered introductory workshops, not production implementation/);
 for(const secret of ['private.example','SECRET_VALUE','sourceText'])a.ok(!wire.includes(secret));a.equal(JSON.stringify(p),before);
});
test('standalone Coursework subgroup and uppercase exact names retain source context',()=>{
 const p=parse('Alex Morgan\nSoftware Engineer\nSKILLS\nCoursework only\nPython, SQL\nEDUCATION\nBSc Computing | Example University\n2020 - 2024');
 a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);
 a.deepEqual(originalSkillContext(p),[{sectionTitle:'SKILLS',groupTitle:'Coursework only',skillIds:['skill_1','skill_2']}]);
 const p2=snapshot('SKILLS\nCoursework:\nPYTHON\nPRIVATE NOTES\nPython');p2.skills.data[0].name='PYTHON';
 a.deepEqual(originalSkillContext(p2)[0].skillIds,['skill_1']);
});
test('qualified known group keeps introductory constraint, not arbitrary headings',()=>{
 const p=snapshot('SKILLS\nProgramming Languages (introductory): Python\nPRIVATE NOTES\nPython');
 a.equal(originalSkillContext(p)[0].groupTitle,'Programming Languages (introductory)');
 for(const text of ['SKILLS (PRIVATE_SENTINEL): Python','SKILLS\nPrivate_SENTINEL: Python','SKILLS\nCoursework (SECRET_SENTINEL): Python'])a.deepEqual(originalSkillContext(snapshot(text)),[]);
});
test('exact skill qualifiers and versions are never renamed or removed',()=>{
 const p=snapshot('SKILLS\nCoursework: Python (introductory), C++, C\n');
 p.skills.data=p.skills.data.slice(0,3);['Python (introductory)','C++','C'].forEach((name,i)=>p.skills.data[i].name=name);
 a.deepEqual(originalSkillContext(p)[0].skillIds,['skill_1','skill_2','skill_3']);
 a.match(engine.projectSource(p).evidence.find(f=>f.id==='skill_1').text,/Python \(introductory\)/);
});
test('unknown/private sections and raw snapshot never become transmitted evidence',()=>{
 const p=fixture();p.customSections=[extra('Private notes',['SECRET_PRIVATE']),extra('Imported details',['SECRET_RAW']),extra('Custom secret',['SECRET_CUSTOM']),extra('COURSEWORK',['Python basics only; no professional practice.'])];
 p.importedFrom={sourceText:'PRIVATE SNAPSHOT\nSECRET_SNAPSHOT\nprivate@example.test'};
 const wire=JSON.stringify(engine.projectSource(p));for(const secret of ['SECRET_PRIVATE','SECRET_RAW','SECRET_CUSTOM','SECRET_SNAPSHOT','private@example.test','sourceText'])a.ok(!wire.includes(secret));
 a.match(wire,/Python basics only; no professional practice/);
});
test('Markdown label, negative and dates survive; links/emails/phone never leave context',()=>{
 const p=fixture();p.customSections=[extra('PUBLICATIONS',['Draft only, not peer reviewed; 2020 - 2024. [Methods](https://private.example/SECRET_LINK). Contact secret@example.test or +966 50 123 4567.'])];
 const rows=professionalContext(p);a.equal(rows.length,1);a.match(rows[0].text,/Draft only, not peer reviewed; 2020 - 2024/);a.match(rows[0].text,/Methods/);
 for(const value of ['SECRET_LINK','private.example','secret@example.test','123 4567'])a.ok(!JSON.stringify(rows).includes(value));
 a.match(rows[0].text,/\[link omitted\]/);a.match(rows[0].text,/\[contact omitted\]/);
});
test('contact-only rows still excluded, leaving no synthetic source qualification',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Email person@example.test','Call +966 50 123 4567','https://private.example/notes','Mentored students.','Program 2020 - 2024'])];
 a.deepEqual(professionalContext(p).map(x=>x.text),['Mentored students.','Program 2020 - 2024']);
});
test('source limits remain fail-safe rather than silent truncation',()=>{
 const p=fixture();p.customSections=[extra('COURSES',['x'.repeat(12001)+' https://private.example'])];a.throws(()=>engine.projectSource(p),/12,000-character/);
 const s=engine.projectSource(fixture());s.evidence.push({...s.evidence[0],id:'too_long',text:'x'.repeat(12001)});a.throws(()=>engine.parseSourceGraph(s));
 const huge=fixture();huge.summary.data='x'.repeat(12001);a.throws(()=>engine.projectSource(huge));
});
test('graph guard rejects contradictory parent before draft acceptance',()=>{
 const s=engine.projectSource(fixture());s.evidence.find(f=>f.id==='work_1_b1').parent='wrong_employer';
 a.throws(()=>engine.parseSourceGraph(s),/inconsistent/);a.equal(engine.validateDraft(s,{}).issues[0].path,'source');a.throws(()=>core.prepareSourceComposition(s,job));
});
test('graph guard rejects duplicate identity, wrong kind and invalid context membership',()=>{
 const fresh=()=>engine.projectSource(fixture());
 for(const mutate of [s=>s.evidence.push({...s.evidence[0]}),s=>s.skillIds.push(s.skillIds[0]),s=>s.experience.push({...s.experience[0]}),s=>s.evidence.find(f=>f.id==='work_1_b1').kind='skill',s=>s.originalSkillContexts=[{sectionTitle:'Skills',groupTitle:'Coursework',skillIds:['unknown']}],s=>s.skillGroups=[{sectionTitle:'Skills',groupTitle:'Coursework',skillIds:['work_1_b1']}],s=>s.originalSkillContexts=[{sectionTitle:'Skills',groupTitle:'Coursework',skillIds:['skill_1','skill_1']}]] ){
  const s=fresh();mutate(s);a.throws(()=>engine.parseSourceGraph(s));
 }
});
test('shared guard preserves metadata, source locks and does not mutate accepted source',()=>{
 const p=fixture();Object.values({summary:p.summary,experience:p.experience,projects:p.projects,skills:p.skills}).forEach(s=>s.isLocked=true);
 const s=engine.projectSource(p),before=JSON.stringify(s),checked=engine.parseSourceGraph(s);a.deepEqual(checked,s);a.notEqual(checked,s);a.equal(JSON.stringify(s),before);a.deepEqual(checked.locks,{summary:true,experience:true,projects:true,skills:true});
 const {withEntryMetadata}=load('services/resumeComposer/references');const enriched=withEntryMetadata(s);a.deepEqual(engine.parseSourceGraph(enriched),enriched);
});
test('context provenance states original_import only when bounded context was recovered',()=>{
 const p=snapshot('SKILLS\nCoursework: Python');a.equal(engine.projectSource(p).skillContextOrigin,'original_import');delete p.importedFrom;a.equal(engine.projectSource(p).skillContextOrigin,'profile_only');
});
test('URL punctuation/brackets cannot expose the remainder of a private path',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Mentored students. [Materials](https://private.example/(part)/SECRET_END) Raw: https://private.example/[SECRET_BRACKET]'])];
 const wire=JSON.stringify(professionalContext(p));a.match(wire,/Mentored students/);a.match(wire,/Materials/);for(const v of ['private.example','part','SECRET_END','SECRET_BRACKET'])a.ok(!wire.includes(v));
});
test('standalone academic Coursework stays editable as a professional extra, not invented experience',()=>{
 const p=parse('Alex Morgan\nSoftware Engineer\nCOURSEWORK\nPython basics; introductory only, not professional practice.\nSKILLS\nPython, SQL');
 a.ok(p.customSections.some(s=>s.title==='COURSEWORK'));a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);
 const source=engine.projectSource(p);a.ok(source.evidence.some(f=>f.kind==='context'&&f.text.includes('introductory only, not professional practice')));a.equal(source.experience.length,0);
});
test('Coursework heading inside Skills is a subgroup; outside it remains a separate section',()=>{
 const p=parse('Alex Morgan\nSoftware Engineer\nSKILLS\nCoursework\nPython, SQL\nEDUCATION\nBSc Computing | Example University\n2020 - 2024');
 a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);a.equal(originalSkillContext(p)[0].groupTitle,'Coursework');
 a.ok(!p.customSections.some(s=>s.title==='Coursework'));
});
test('Arabic delimiters and known Key Skills heading recover the same exact imported skills',()=>{
 const p=parse('Alex Morgan\nSoftware Engineer\nKEY SKILLS\nCoursework: Python، SQL');
 a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);a.deepEqual(originalSkillContext(p)[0].skillIds,['skill_1','skill_2']);
});
test('private-note heading terminates imported skill scope and remains local editable content',()=>{
 for(const title of ['PRIVATE NOTES','Personal notes','ملاحظات خاصة']){
  const p=parse('Alex Morgan\nSoftware Engineer\nSKILLS\nCoursework: Python, SQL\n'+title+'\nPRIVATE_NOTE_SENTINEL\nEmail private@example.test');
  a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);a.ok(p.customSections.some(s=>s.paragraphs.join(' ').includes('PRIVATE_NOTE_SENTINEL')));a.ok(p.importedFrom.sourceText.includes('PRIVATE_NOTE_SENTINEL'));
  const wire=JSON.stringify(engine.projectSource(p));for(const secret of ['PRIVATE_NOTE_SENTINEL','private@example.test','sourceText'])a.ok(!wire.includes(secret));
 }
});
const spacedWork='Software Engineer | Example Systems\n\nJan 2022 - Dec 2025\n\n• Built web applications.\n\n• Improved delivery workflows; not runtime optimization.';
const spacedEducation='Bachelor of Computer Science (in progress)\n\nExample University\n\nExpected 2027';
test('PDF-like blank line after every line preserves work/date/bullets and ongoing education',()=>{
 const text='Morgan Test\n\nSoftware Engineer\n\nEXPERIENCE\n\n'+spacedWork+'\n\nEDUCATION\n\n'+spacedEducation;
 const p=buildImportedProfile({text,warnings:[]},'fictional.pdf','pdf',theme);
 a.equal(p.experience.data.length,1);a.equal(p.experience.data[0].companyName,'Example Systems');a.equal(p.experience.data[0].startDate,'Jan 2022');a.equal(p.experience.data[0].bullets.length,2);a.match(p.experience.data[0].bullets[1].text,/not runtime optimization/);
 a.equal(p.education.data.length,1);a.equal(p.education.data[0].institution,'Example University');a.equal(p.education.data[0].graduationDate,'Expected 2027');a.match(p.education.data[0].degree,/in progress/);a.equal(p.importedFrom.sourceText,text);
});
test('spaced two jobs never share dates or contributions; supports split role and employer',()=>{
 const text='Alex Morgan\nEXPERIENCE\n'+spacedWork+'\n\nWeb Developer\n\nSecond Studio\n\nJan 2019 - Dec 2021\n\n• Built second-company dashboards.\n\n• Maintained second-company documentation.';
 const p=parse(text);a.equal(p.experience.data.length,2);a.deepEqual(p.experience.data.map(e=>e.companyName),['Example Systems','Second Studio']);a.equal(p.experience.data[0].bullets.length,2);a.equal(p.experience.data[1].bullets.length,2);a.equal(p.experience.data[1].startDate,'Jan 2019');a.ok(!p.experience.data[0].bullets.some(b=>b.text.includes('second-company')));
});
test('spaced institution-first and distinct education programs never merge',()=>{
 const p=parse('Alex Morgan\nEDUCATION\nExample University\n\nBachelor of Computing\n\n2015 - 2019\n\nMaster of Computing\n\nSecond University\n\n2020 - 2022');
 a.equal(p.education.data.length,2);a.deepEqual(p.education.data.map(e=>e.institution),['Example University','Second University']);a.deepEqual(p.education.data.map(e=>e.endDate),['2019','2022']);
});
test('ambiguous multiple headers or two dates remain editable, never merge invented identity',()=>{
 const text='Alex Morgan\nEXPERIENCE\nSoftware Engineer | First Company\n\nWeb Developer | Second Company\n\n2020 - 2024\n\n• Worked on systems.\n\nEDUCATION\nExample Institute\n\nAdvanced Professional Program';
 const p=parse(text);a.ok(p.experience.data.length<=1);if(p.experience.data.length)a.equal(p.experience.data[0].companyName,'Second Company');
 const local=p.customSections.flatMap(s=>s.paragraphs).join('\n');a.match(local,/Software Engineer \| First Company/);a.match(local,/Example Institute/);a.match(local,/Advanced Professional Program/);
});
test('ambiguous consecutive date ranges cannot be silently assigned to one job',()=>{
 const p=parse('Alex Morgan\nEXPERIENCE\nSoftware Engineer | Company\n\n2020 - 2022\n\n2023 - 2024\n\n• Built systems.');
 const all=JSON.stringify(p);a.ok(all.includes('2020 - 2022'));a.ok(all.includes('2023 - 2024'));
 a.ok(p.customSections.some(s=>s.paragraphs.some(x=>x.includes('2023 - 2024'))));
});
test('reverse-orphan narrative cannot become a citable same-entry passage',()=>{
 const s=engine.projectSource(fixture());s.evidence.push({id:'work_1_orphan',kind:'achievement',parent:'work_1',text:'Unlisted narrative fact.'});
 a.throws(()=>engine.parseSourceGraph(s),/inconsistent/);a.throws(()=>core.prepareSourceComposition(s,job));
});
test('atomic independent skills under standalone and labelled groups are never fused',()=>{
 for(const [heading,names] of [['Coursework only',['Python','SQL']],['Tools',['MySQL','Docker']]]){
  const p=parse('Alex Morgan\nSoftware Engineer\nSKILLS\n'+heading+'\n'+names.join('\n'));a.deepEqual(p.skills.data.map(s=>s.name),names);a.deepEqual(originalSkillContext(p)[0].skillIds,['skill_1','skill_2']);
 }
 const p=parse('Alex Morgan\nSKILLS\nCoursework: Python\nSQL');a.deepEqual(p.skills.data.map(s=>s.name),['Python','SQL']);
});
test('explicit wrapped compound qualifiers and multi-token continuation retain native names',()=>{
 const p=parse('Alex Morgan\nSKILLS\nBackend Development: PHP (Laravel,\nCustom MVC), Python, C++\nProduct & Operations: Project Management, Agile/Scrum, Business\nOperations, Strategic Planning');
 const names=p.skills.data.map(s=>s.name);a.ok(names.includes('PHP (Laravel, Custom MVC)'));a.ok(names.includes('Business Operations'));a.ok(!names.includes('Business'));a.ok(!names.includes('Operations'));a.ok(names.includes('C++'));
});
test('professional metrics and ISO qualification numbers are preserved verbatim',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Processed 123456789 records in a local benchmark; not production.','Completed ISO 27001 2013 coursework only.'])];
 a.deepEqual(professionalContext(p).map(x=>x.text),p.customSections[0].paragraphs);const wire=JSON.stringify(engine.projectSource(p));a.match(wire,/123456789 records/);a.match(wire,/ISO 27001 2013/);a.ok(!wire.includes('[contact omitted]'));
});
test('explicit phone labels and international numbers are scrubbed without metrics loss',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Mentored students. Phone: 0501234567.','Processed 123456789 records; contact +966 50 123 4567.','Completed ISO 27001 2013 coursework. Call (050) 1234567.'])];
 const wire=JSON.stringify(professionalContext(p));for(const secret of ['0501234567','123 4567','(050) 1234567'])a.ok(!wire.includes(secret));a.match(wire,/123456789 records/);a.match(wire,/ISO 27001 2013/);
});
test('ambiguous unlabelled long number fails visibly with no source mutation or secret echo',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Mentored students; reference 1234567890.'])];const before=JSON.stringify(p);
 a.throws(()=>engine.projectSource(p),e=>e.code==='input'&&e.message.includes('ambiguous contact-like')&&!e.message.includes('1234567890'));a.equal(JSON.stringify(p),before);
});
test('shared guard permits general professional context and metadata but rejects all reverse narrative kinds',()=>{
 const {withEntryMetadata}=load('services/resumeComposer/references');const s=withEntryMetadata(engine.projectSource(fixture()));s.evidence.push({id:'professional_extra',kind:'context',parent:'',text:'Academic coursework only.'});a.deepEqual(engine.parseSourceGraph(s),s);
 for(const kind of ['role','achievement','project']){const bad=structuredClone(s);bad.evidence.push({id:'orphan',kind,parent:'work_1',text:'Unlisted narrative.'});a.throws(()=>engine.parseSourceGraph(bad));}
});
test('clearly labelled seven-digit local phone is not mistaken for a metric',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Mentored students. Phone: 5551234.'])];const rows=professionalContext(p);a.equal(rows.length,1);a.ok(!JSON.stringify(rows).includes('5551234'));a.match(rows[0].text,/contact omitted/);
});
test('parented context cannot masquerade as narrative outside derived metadata namespace',()=>{
 const s=engine.projectSource(fixture());s.evidence.push({id:'pseudo_work',kind:'context',parent:'work_1',text:'Unlisted achievement context.'});a.throws(()=>engine.parseSourceGraph(s));a.throws(()=>core.prepareSourceComposition(s,job));
});
test('explicit phone labels and international prefixes outrank a misleading metric suffix',()=>{
 const p=fixture();p.customSections=[extra('VOLUNTEERING',['Mentored students. Phone: 123456789 records.','Mentored students. +15551234567 records.','Mentored students. 0015551234567 records.'])];
 const wire=JSON.stringify(professionalContext(p));for(const value of ['123456789','+15551234567','0015551234567'])a.ok(!wire.includes(value));a.match(wire,/Mentored students/);a.match(wire,/contact omitted/);
});
