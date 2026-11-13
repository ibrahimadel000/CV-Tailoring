// Local parser tests: node --test tests/batch15-import.test.cjs
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const {zipSync,strToU8}=require('fflate');
const root=path.resolve(__dirname,'..');const cache=new Map();
function loadTs(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(root);const normal=mod.require.bind(mod);mod.require=id=>id.startsWith('@/')?loadTs(path.join(root,'src',id.slice(2)+'.ts')):id.startsWith('./')?loadTs(path.resolve(path.dirname(file),id+'.ts')):normal(id);cache.set(file,mod);let text=fs.readFileSync(file,'utf8').replace(/import\.meta\.url/g,JSON.stringify('file://'+file));mod._compile(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return mod.exports;}
const model=loadTs(path.join(root,'src/services/cvImportModel.ts'));const files=loadTs(path.join(root,'src/services/cvImportFiles.ts'));const {cvProfileSchema}=loadTs(path.join(root,'src/types/schema.ts'));
const theme={accentColor:'#2557a7',fontFamily:'sans',fontSize:'medium',lineSpacing:'normal',layoutStyle:'modern'};

const parse=(text,regions)=>model.buildImportedProfile({text,warnings:[],regions},'Test.pdf','pdf',theme);
test('decorative section spacing normalizes headings, never body claims',()=>{const p=parse('Alex Morgan\nSoftware Engineer\nP RO F IL E\nBuild accessible products.\nWO RK E X P E RI E NCE\nSoftware Engineer\nExample Studio\nApr 2023 – May 2026\n• Built accessible interfaces.\nE DUCAT I O N\nBachelor of Computer Science (in progress)\nExample University\nExpected 2027\nCurrent GPA: 3.8 / 4.0');assert.equal(p.summary.data,'Build accessible products.');assert.equal(p.experience.data.length,1);assert.equal(p.experience.data[0].bullets[0].text,'Built accessible interfaces.');assert.equal(p.education.data.length,1);assert.equal(p.education.data[0].graduationDate,'Expected 2027');assert.equal(p.education.data[0].degree,'Bachelor of Computer Science (in progress)');assert(p.importedFrom.sourceText.includes('P RO F IL E'));});
test('wrapped labelled skill groups stay together and preserve parenthesized commas',()=>{const p=parse('Alex Morgan\nTECHNICAL SKILLS\nBackend Development: PHP (Laravel, Custom MVC), Python, Java,\nC++, RESTful APIs\nFrontend: HTML5, CSS3, JavaScript\nBUS I NE S S & M ANAG E M E NT COM P ET E NCI E S\nProduct & Operations: Project Management, Agile/Scrum, Business\nOperations, Strategic Planning');const names=p.skills.data.map(s=>s.name);assert(names.includes('PHP (Laravel, Custom MVC)'));assert(names.includes('C++'));assert(names.includes('Business Operations'));assert(!names.includes('Operations'));assert.equal(names.filter(n=>n==='Java').length,1);});
test('certificate wrapped titles and spaced months retain six records without invented issuers',()=>{const p=parse('Alex Morgan\nCERTIFICATIONS\nBasics of Marketing\nJ un 2 0 2 4\nCyber Security (80-hour course)\nM a r 2 02 4\nProgramming Basics: Python,\nJava, C++\nJ an 2 0 2 3\nCompany Website Development –\nGoogle\nJ an 2 0 2 3\nICDL – International Computer\nDriving Licence\nNo v 20 2 2\nCybersecurity Fundamentals\nDe c 20 2 1');assert.equal(p.certifications.data.length,6);assert(p.certifications.data.every(c=>!c.issuer));assert(p.certifications.data.some(c=>c.name.includes('Driving Licence')));assert(p.certifications.data.some(c=>c.name.includes('Google')));});
test('column regions independently classify sections and retain exact combined source',()=>{const regions=[{page:1,lane:'left',text:'CONTACT\nEMAIL\nalex@example.com\nLOCATION\nRiyadh, Saudi Arabia\nLANGUAGES\nArabic — Native\nEnglish — Excellent\nEXPERTISE\nProject Management, System Analysis'},{page:1,lane:'right',text:'Alex Morgan\nSoftware Engineer\nPROFILE\nBuild accessible products.\nWORK EXPERIENCE\nEngineer | Example Studio\n2023 - 2026\n• Built interfaces.'}];const text=regions.map(r=>r.text).join('\n\n');const p=parse(text,regions);assert.equal(p.resumeHeader.data.name,'Alex Morgan');assert.equal(p.resumeHeader.data.email,'alex@example.com');assert.equal(p.resumeHeader.data.location,'Riyadh, Saudi Arabia');assert.equal(p.experience.data.length,1);assert.equal(p.skills.data.length,2);assert(p.customSections.some(s=>s.title==='LANGUAGES'));assert.equal(p.importedFrom.sourceText,text);assert(cvProfileSchema.safeParse(p).success);});
test('inconsistent reading-order snapshot rejected before creating profile',()=>{assert.throws(()=>parse('Alex Morgan\nPROFILE\nBuild web products.',[{page:1,lane:'full',text:'Different text'}]));});
test('empty trailing page region accepted without silent source mismatch',()=>{const text='Alex Morgan\nPROFILE\nBuild accessible products.';const p=parse(text,[{page:1,lane:'full',text},{page:2,lane:'full',text:''}]);assert.equal(p.summary.data,'Build accessible products.');});
test('unknown decorated heading is not guessed as professional experience',()=>{const p=parse('Alex Morgan\nM Y C U S T O M N O T E S\nWorked on internal systems.');assert.equal(p.experience.data.length,0);assert(p.customSections.some(s=>s.paragraphs.join(' ').includes('Worked on internal systems.')));});
test('geometry retains date alignment without classifying date column as sidebar',()=>{const item=(str,x,y,width=80)=>({str,transform:[10,0,0,10,x,y],width,height:10});const r=files.pdfPageLines([item('Alex Morgan',40,800),item('EXPERIENCE',40,760),item('Software Engineer',40,740),item('2020 - 2024',430,740),item('Built accessible interfaces',40,720,160),item('EDUCATION',40,680),item('Example University',40,660),item('2017 - 2020',430,660)],595);assert.equal(r.complex,false);assert(r.text.includes('Software Engineer | 2020 - 2024'));});
test('positioned two-column text separates sidebar from main work bullets',()=>{const item=(str,x,y,width=150)=>({str,transform:[10,0,0,10,x,y],width,height:11});const items=[item('Alex Morgan',230,810,100),item('Software Engineer',230,790),item('CONTACT',30,750,80),item('EMAIL',30,730,50),item('alex@example.com',30,710),item('LANGUAGES',30,670,90),item('Arabic — Native',30,650),item('English — Excellent',30,630),item('EXPERTISE',30,590,90),item('Project Management',30,570),item('System Analysis',30,550),item('PROFILE',230,750,70),item('Build accessible products.',230,730,190),item('WORK EXPERIENCE',230,690,140),item('Engineer | Example Studio',230,670,200),item('2023 - 2026',230,650,90),item('• Built accessible interfaces.',230,630,200),item('EDUCATION',230,590,90),item('Bachelor of Computer Science',230,570,210),item('Example University',230,550,160)];const r=files.pdfPageLines(items,595);assert.equal(r.complex,true);assert(r.regions.length>=2);const p=parse(r.text,r.regions);assert.equal(p.resumeHeader.data.name,'Alex Morgan');assert.equal(p.experience.data.length,1);assert(!p.experience.data[0].bullets[0].text.includes('Arabic'));assert.equal(p.education.data.length,1);assert(p.importedFrom.sourceText.includes('System Analysis'));});
test('invalid PDF position values are ignored safely',()=>{const r=files.pdfPageLines([{str:'Bad',transform:[10,0,0,10,NaN,700],width:50,height:10}],595);assert.equal(r.text,'');});

test('inline contact heading retains supplied email',()=>{const p=parse('Alex Morgan\nSoftware Engineer\nContact: Email alex@example.com\nPROFILE\nBuild accessible products.');assert.equal(p.resumeHeader.data.email,'alex@example.com');});

// Prepared generic cases; no person/institution-specific normalization.
const reconciliation=loadTs(path.join(root,'src/services/cvImportEducation.ts'));
const school=(degree='Bachelor of Computer Science (in progress)',institution='Example University of Technology Campus')=>({id:crypto.randomUUID(),degree,institution,startDate:'',endDate:'Expected 2027',graduationDate:'Expected 2027',gpa:'3.8 / 4.0',description:''});
test('wrapped header education stays editable, structured entry and snapshot stay intact',()=>{
 const text='Alex Morgan\nSoftware Engineer\nB.Sc. Computer Science (in progress) – Example University of Technology\nCampus\nPROFILE\nBuild accessible web products.\nEDUCATION\nBachelor of Computer Science (in progress)\nExample University of Technology Campus\nExpected 2027\nCurrent GPA: 3.8 / 4.0';const p=parse(text);
 assert.equal(p.education.data.length,1);assert.equal(p.education.data[0].institution,'Example University of Technology Campus');assert.equal(p.education.data[0].graduationDate,'Expected 2027');assert.equal(p.education.data[0].gpa,'3.8 / 4.0');assert(p.customSections.some(s=>s.title==='Imported details'&&s.paragraphs.join(' ').includes('B.Sc.')));assert.equal(p.importedFrom.sourceText,text);assert(!p.importedFrom.warnings.some(w=>w.includes('repeated header education')));
});
for(const suffix of ['Campus','North Campus'])test('ambiguous institution continuation retained in imported details: '+suffix,()=>{const entry=school(undefined,'Example University '+suffix);const lines=['B.Sc. Computer Science (in progress) – Example University',suffix,'Available for remote work'];const before=JSON.stringify(entry),r=reconciliation.reconcileHeaderEducation(lines,[entry]);assert.deepEqual(r.remaining,lines);assert.equal(r.matches.length,0);assert.equal(JSON.stringify(entry),before);});
for(const [label,degree,institution] of [
 ['different major','Bachelor of Mathematics (in progress)','Example University of Technology Campus'],
 ['missing progress qualifier','Bachelor of Computer Science','Example University of Technology Campus'],
 ['completed qualifier','Bachelor of Computer Science (completed)','Example University of Technology Campus'],
 ['different campus','Bachelor of Computer Science (in progress)','Example University of Technology Other Campus'],
 ['different award','Master of Computer Science (in progress)','Example University of Technology Campus'],
 ['different year','Bachelor of Computer Science (in progress) 2028','Example University of Technology Campus'],
])test('mismatch remains editable, never silently unified: '+label,()=>{const lines=['B.Sc. Computer Science (in progress) – Example University of Technology','Campus'];const r=reconciliation.reconcileHeaderEducation(lines,[school(degree,institution)]);assert.deepEqual(r.remaining,lines);assert.equal(r.matches.length,0);});
test('two equal programs with different periods are ambiguous, header retained',()=>{const a=school(),b={...school(),endDate:'Expected 2028'};const lines=['B.Sc. Computer Science (in progress) – Example University of Technology Campus'];assert.deepEqual(reconciliation.reconcileHeaderEducation(lines,[a,b]).remaining,lines);});
test('unmapped header education remains rather than invented school or discarded text',()=>{const text='Alex Morgan\nSoftware Engineer\nB.Sc. Computer Science (in progress) – Example University\nRemote volunteer\nPROFILE\nBuild accessible web products.';const p=parse(text);assert.equal(p.education.data.length,0);assert.deepEqual(p.customSections.find(s=>s.title==='Imported details').paragraphs,['B.Sc. Computer Science (in progress) – Example University','Remote volunteer']);assert.equal(p.importedFrom.sourceText,text);});
test('adjacent header notes and wrapped statement all survive',()=>{const r=reconciliation.reconcileHeaderEducation(['Available for remote work','B.Sc. Computer Science (in progress) – Example University of Technology','Campus','Member of Community Group'],[school()]);assert.deepEqual(r.remaining,['Available for remote work','B.Sc. Computer Science (in progress) – Example University of Technology','Campus','Member of Community Group']);});
test('header lines are never joined across sections or column regions',()=>{const regions=[{page:1,lane:'right',text:'Alex Morgan\nSoftware Engineer\nB.Sc. Computer Science (in progress) – Example University of Technology\nPROFILE\nBuild accessible web products.\nEDUCATION\nBachelor of Computer Science (in progress)\nExample University of Technology Campus\nExpected 2027'},{page:1,lane:'left',text:'CONTACT\nCampus'}];const p=parse(regions.map(r=>r.text).join('\n\n'),regions);assert.deepEqual(p.customSections.find(s=>s.title==='Imported details').paragraphs,['B.Sc. Computer Science (in progress) – Example University of Technology','Campus']);});
test('short forms do not match institution substrings or extra qualifiers',()=>{for(const lines of [['B.Sc. Computer Science (in progress) – Example University'],['B.Sc. Computer Science (in progress) – Example University of Technology Campus (honors)']])assert.deepEqual(reconciliation.reconcileHeaderEducation(lines,[school()]).remaining,lines);});
test('body paragraphs and achievements are not deduplicated by header education rule',()=>{const text='Alex Morgan\nSoftware Engineer\nPROFILE\nB.Sc. Computer Science (in progress) – Example University of Technology Campus\nEDUCATION\nBachelor of Computer Science (in progress)\nExample University of Technology Campus\nExpected 2027';const p=parse(text);assert(p.summary.data.includes('B.Sc.'));assert.equal(p.education.data.length,1);assert(!p.importedFrom.warnings.some(w=>w.includes('repeated header education')));});

// Fictional cases: never infer or drop a degree status when source fields differ.
test('header-only progress qualifier stays editable with targeted education review',()=>{
 const text='Jordan River\nConsultant\nBSc Environmental Science (in progress) – Fictional Institute of Studies\nWest Campus\nPROFILE\nSupports environmental research.\nEDUCATION\nBachelor of Environmental Science\nFictional Institute of Studies West Campus\n2030';const p=parse(text);
 assert.equal(p.education.data[0].degree,'Bachelor of Environmental Science');
 assert(p.customSections.some(s=>s.title==='Imported details'&&s.paragraphs.join(' ').includes('in progress')));
 assert(p.importedFrom.warnings.some(w=>/education status.*review/i.test(w)));
 assert.equal(p.importedFrom.sourceText,text);
});
test('degree header mentioning an occupation is not promoted to a job headline',()=>{
 const text='Jordan River\nBSc Civil Engineering (in progress) – Fictional Institute\nPROFILE\nSupports environmental research.\nEDUCATION\nBachelor of Civil Engineering\nFictional Institute\n2030';const p=parse(text);
 assert.equal(p.headline.data,'');assert(p.customSections.some(s=>s.title==='Imported details'&&s.paragraphs.join(' ').includes('BSc Civil Engineering (in progress)')));
});
for(const separator of ['\n\n','\nEMAIL\njordan@example.invalid\n'])test('header reconciliation cannot join fragments across a removed boundary '+JSON.stringify(separator),()=>{
 const text='Jordan River\nConsultant\nBSc Environmental Science (in progress) – Fictional Institute'+separator+'West Campus\nPROFILE\nSupports environmental research.\nEDUCATION\nBachelor of Environmental Science (in progress)\nFictional Institute West Campus\n2030';const p=parse(text);
 const section=p.customSections.find(s=>s.title==='Imported details');assert(section);assert(section.paragraphs.some(x=>x.includes('BSc Environmental Science')));assert(section.paragraphs.includes('West Campus'));
 assert(!p.importedFrom.warnings.some(w=>w.includes('repeated header education')));
});
test('unclosed degree qualifier is preserved instead of assigning continuation as institution',()=>{
 const text='Jordan River\nConsultant\nPROFILE\nSupports environmental research.\nEDUCATION\nBachelor of Environmental Science (in\nprogress)\nFictional Institute\n2030';const p=parse(text);
 assert.equal(p.education.data.length,0);const s=p.customSections.find(s=>s.title.toLowerCase()==='education');assert(s);assert(s.paragraphs.join(' ').includes('(in progress)'));assert(s.paragraphs.includes('Fictional Institute'));assert(p.importedFrom.warnings.some(w=>w.includes('could not be mapped confidently')));
});

test('status warning requires same uniquely matched degree and full institution',()=>{
 const header=['BSc Environmental Science (in progress) – Fictional Institute','West Campus'];
 const entry=(degree,institution)=>({id:crypto.randomUUID(),degree,institution,startDate:'',endDate:'',description:''});
 for(const entries of [[],[entry('Bachelor of Biology','Fictional Institute West Campus')],[entry('Bachelor of Environmental Science','Fictional Institute Other Campus')],[entry('Bachelor of Environmental Science (in progress)','Fictional Institute West Campus')],[entry('Bachelor of Environmental Science','Fictional Institute West Campus'),entry('Bachelor of Environmental Science','Fictional Institute West Campus')]]){
  const before=JSON.stringify(entries),r=reconciliation.reconcileHeaderEducation(header,entries);assert.equal(r.statusReviewNeeded,false);assert.equal(JSON.stringify(entries),before);
 }
});

// Independent paragraphs and wrapped physical lines are indistinguishable here.
test('never discard ambiguous neighboring header lines even when joined text matches',()=>{
 const lines=['BSc Marine Science – Example Institute','Coastal Campus'];
 const e=school('Bachelor of Marine Science','Example Institute Coastal Campus');
 const r=reconciliation.reconcileHeaderEducation(lines,[e]);assert.deepEqual(r.remaining,lines);assert.equal(r.matches.length,0);
});
test('single-line match retains possible school continuation',()=>{
 const lines=['BSc Marine Science – Example Institute','Coastal Campus'];
 const r=reconciliation.reconcileHeaderEducation(lines,[school('Bachelor of Marine Science','Example Institute')]);assert.deepEqual(r.remaining,lines);
});
test('single complete unambiguous header is deduplicated',()=>{
 const lines=['BSc Marine Science – Example Institute'];const r=reconciliation.reconcileHeaderEducation(lines,[school('Bachelor of Marine Science','Example Institute')]);assert.deepEqual(r.remaining,[]);assert.equal(r.matches.length,1);
});
test('duplicate identity with description remains ambiguous',()=>{
 const a=school('Bachelor of Marine Science','Example Institute');const b={...school('Bachelor of Marine Science','Example Institute'),description:'Different award'};
 const lines=['BSc Marine Science – Example Institute'];assert.deepEqual(reconciliation.reconcileHeaderEducation(lines,[a,b]).remaining,lines);
});
test('status warning does not match an incomplete institution prefix',()=>{
 const lines=['BSc Marine Science (in progress) – Example Institute','Coastal Campus'];
 const entries=[school('Bachelor of Marine Science','Example Institute'),school('Bachelor of Marine Science (in progress)','Example Institute Coastal Campus')];
 assert.equal(reconciliation.reconcileHeaderEducation(lines,entries).statusReviewNeeded,false);
});
test('doctor name and associate role remain identifiable',()=>{
 const p=parse('Doctor Jane Smith\nAssociate Product Manager\nPROFILE\nCoordinates product work.');assert.equal(p.resumeHeader.data.name,'Doctor Jane Smith');assert.equal(p.headline.data,'Associate Product Manager');
});
test('wrapped occupation word in qualification is not a headline',()=>{
 const p=parse('Jordan River\nBSc Civil\nEngineering (in progress) – Fictional College\nPROFILE\nSupports community projects.');assert.equal(p.headline.data,'');assert(p.customSections.find(s=>s.title==='Imported details').paragraphs.some(x=>x.includes('Engineering (in progress)')));
});
for(const pair of [['Bachelor of Marine Science [in','progress]'],['Bachelor of Marine Science','(in progress)']])test('ambiguous education qualifier retained in editable section '+pair[0],()=>{
 const p=parse('Jordan River\nConsultant\nEDUCATION\n'+pair.join('\n')+'\nExample College\n2030');assert.equal(p.education.data.length,0);assert(p.customSections.some(s=>s.title.toLowerCase()==='education'&&s.paragraphs.includes('Example College')));
});

test('removed contact resets a pending education continuation',()=>{
 const p=parse('Jordan River\nBSc Civil\njordan@example.invalid\nProduct Manager\nPROFILE\nCoordinates projects.');assert.equal(p.headline.data,'Product Manager');assert(p.customSections.find(s=>s.title==='Imported details').paragraphs.includes('BSc Civil'));
});

for(const field of ['C++ Programming','C# Programming'])test('meaningful degree symbols are not erased: '+field,()=>{
 const lines=['BSc '+field+' – Example College'];const r=reconciliation.reconcileHeaderEducation(lines,[school('Bachelor of C Programming','Example College')]);assert.deepEqual(r.remaining,lines);
});
test('an ambiguous possible headline gets a review warning',()=>{
 const p=parse('Jordan River\nBSc Biology\nSoftware Engineer\nPROFILE\nSupports teams.');assert(p.customSections.find(s=>s.title==='Imported details').paragraphs.includes('Software Engineer'));assert(p.importedFrom.warnings.some(w=>w.includes('job headline')));
});
test('BS degree header is not promoted to headline',()=>{
 const p=parse('Jordan River\nB.S. Civil Engineering – Example College\nPROFILE\nSupports teams.');assert.equal(p.headline.data,'');assert(p.customSections.some(s=>s.paragraphs.some(x=>x.includes('B.S. Civil Engineering'))));
});
for(const qualifier of ['in progress','part-time','full time'])test('unparenthesized qualifier is not an institution: '+qualifier,()=>{
 const p=parse('Jordan River\nConsultant\nEDUCATION\nBachelor of Marine Science\n'+qualifier+'\nExample College\n2030');assert.equal(p.education.data.length,0);assert(p.customSections.some(s=>s.title.toLowerCase()==='education'&&s.paragraphs.includes('Example College')));
});
test('status in a matching degree suppresses alert but free-text remains reviewable',()=>{
 const lines=['BSc Marine Science (in progress) – Example College'];const plain=school('Bachelor of Marine Science','Example College');
 assert.equal(reconciliation.reconcileHeaderEducation(lines,[plain,{...school('Bachelor of Marine Science (in progress)','Example College'),description:'Honors'}]).statusReviewNeeded,false);
 for(const description of ['Currently in progress','Not in progress'])assert.equal(reconciliation.reconcileHeaderEducation(lines,[{...plain,description}]).statusReviewNeeded,true);
});
