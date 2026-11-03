// End-to-end offline PDF export checks with fictional data. Requires pdftotext.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {load}=require('./helpers/tsx-loader.cjs');
const {createSampleProfile}=load('mock/profile');
const {getResumePDF}=load('components/builder/pdfPipeline');
const theme={accentColor:'#2557a7',fontFamily:'sans',fontSize:'medium',lineSpacing:'normal',layoutStyle:'modern'};
const long='Designed and engineered resilient data dashboards and reporting architectures, connecting data sources with routine reporting tasks.';
function profile(bullets,certs){
 const p=createSampleProfile('Fictional Pagination Fixture');
 p.experience.data=[{id:crypto.randomUUID(),roleTitle:'Software Engineer',companyName:'Example Systems',city:'',startDate:'Apr 2023',endDate:'May 2026',description:'',isVerified:false,bullets:bullets.map(text=>({id:crypto.randomUUID(),text,isVerified:true}))}];
 p.projects.data=[];
 p.certifications.data=Array.from({length:certs},(_,i)=>({id:crypto.randomUUID(),name:`Fictional Certificate ${String(i+1).padStart(2,'0')}`,issuer:'Example Institute',date:'Jan 2023'}));
 return p;
}
async function render(p){
 const before=JSON.stringify(p), blob=await getResumePDF(p,theme), bytes=Buffer.from(await blob.arrayBuffer());
 assert.equal(JSON.stringify(p),before,'rendering must not mutate the profile');
 const text=execFileSync('pdftotext',['-layout','-','-'],{input:bytes,maxBuffer:10*1024*1024}).toString();
 const pages=text.split('\f').filter(s=>s.trim());
 const xml=execFileSync('pdftotext',['-bbox','-','-'],{input:bytes,maxBuffer:10*1024*1024}).toString();
 for(const match of xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)){
   const [x1,y1,x2,y2]=match.slice(1).map(Number);
   assert(x1>=0 && y1>=0 && x2<=595.28+1 && y2<=841.89+1,`text outside page: ${match[0]}`);
 }
 return {text,pages};
}
test('a small certification section moves together and retains every credential',async()=>{
 const p=profile(Array(5).fill(long),6),{pages}=await render(p);
 const locations=Array.from({length:6},(_,i)=>pages.findIndex(s=>s.includes(`Fictional Certificate ${String(i+1).padStart(2,'0')}`)));
 assert(locations.every(i=>i>=0));
 assert.equal(new Set(locations).size,1,`credentials split over ${locations}`);
 assert(pages[locations[0]].includes('CERTIFICATIONS'));
});
test('long certification sections preserve all credentials across pages',async()=>{
 const p=profile([long],55),{pages}=await render(p);
 for(let i=1;i<=55;i++)assert(pages.some(s=>s.includes(`Fictional Certificate ${String(i).padStart(2,'0')}`)),`missing cert ${i}`);
 assert(pages.length>=2);
 for(const page of pages.filter(s=>s.includes('Fictional Certificate'))) assert(/CERTIFICATIONS(?: \(CONTINUED\))?/.test(page),'missing section heading on a certificate page');
});
test('oversized bullets flow across pages without losing their ending',async()=>{
 const text='FIRSTSENTINEL '+('Detailed fictional work across application systems and delivery. '.repeat(500))+' LASTSENTINEL';
 const {text:out,pages}=await render(profile([text],0));
 assert(out.includes('FIRSTSENTINEL'));assert(out.includes('LASTSENTINEL'));assert(pages.length>=2);
 assert.equal((out.replace(/\s+/g,' ').match(/Detailed fictional work across application systems and delivery\./g)||[]).length,500,'long bullet lost text');
});
test('explicit entry page breaks are respected even in small sections',async()=>{
 const p=profile([long],3);p.pageLayout={sections:{},entries:{[p.certifications.data[1].id]:'new-page'}};
 const {pages}=await render(p);
 const page1=pages.findIndex(s=>s.includes('Fictional Certificate 01'));
 const page2=pages.findIndex(s=>s.includes('Fictional Certificate 02'));
 assert(page1>=0 && page2>page1,`manual break not respected ${page1},${page2}`);
 assert(pages.some(s=>s.includes('Fictional Certificate 03')));
});
