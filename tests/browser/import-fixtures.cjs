// Fictional test fixtures generated locally. No private data or external service.
const {zipSync,strToU8}=require('fflate');
const header=['Maya Vale','Junior Software Engineer','maya@example.invalid','','PROFESSIONAL SUMMARY','Junior developer with classroom API experience.','','WORK EXPERIENCE','Software Engineer Intern | Example Systems','Jan 2024 - Jun 2024'];
const end=['','EDUCATION','BSc Computer Science (in progress) | Example University','Expected 2027','','SKILLS','Python (coursework only), SQL (beginner)'];
const simple=[...header,'- Built Python APIs for a classroom exercise, not production.','- Recorded manual testing results.',...end];
const bullets=Array.from({length:30},(_,i)=>`- Classroom task ${String(i+1).padStart(2,'0')}: documented manual review and assisted the team.`);
const xml=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function docx(lines=simple,table=false,extras={}){
 const paragraphsOf=lines=>lines.map(s=>`<w:p><w:r><w:t xml:space="preserve">${xml(s)}</w:t></w:r></w:p>`).join('');
 const row=cells=>`<w:tr>${cells.map(cell=>`<w:tc>${paragraphsOf(cell)}</w:tc>`).join('')}</w:tr>`;
 const paragraphs=table?`<w:tbl>${table==='multi'?lines.map(row).join(''):row(lines)}</w:tbl>`:paragraphsOf(lines);
 const files={
  '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml':`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`};
 for(const [name,text] of Object.entries(extras)){const tag=name.startsWith('header')?'hdr':'ftr';files[`word/${name}.xml`]=`<?xml version="1.0"?><w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${paragraphsOf([text])}</w:${tag}>`;}
 return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)]))));
}
const escapePdf=s=>s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
function pdf(pages,scanned=false){
 const objects=[];const set=(n,s)=>{objects[n]=s};
 set(1,'<< /Type /Catalog /Pages 2 0 R >>');
 set(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+2*i} 0 R`).join(' ')}] >>`);
 set(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const imageId=4+2*pages.length;
 for(let i=0;i<pages.length;i++){
  const content=scanned?'q 500 0 0 200 40 500 cm /Im1 Do Q':pages[i].map((line,j)=>{if(!line)return '';const t=typeof line==='string'?{text:line,x:40,y:795-j*18}:line;return `BT /F1 10 Tf ${t.x} ${t.y} Td (${escapePdf(t.text)}) Tj ET`;}).join('\n');
  const resources=`<< /Font << /F1 3 0 R >>${scanned?` /XObject << /Im1 ${imageId} 0 R >>`:''} >>`;
  set(4+2*i,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources ${resources} /Contents ${5+2*i} 0 R >>`);
  set(5+2*i,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
 }
 if(scanned){const data='00ff'.repeat(32)+'>';set(imageId,`<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${data.length} >>\nstream\n${data}\nendstream`);}
 let output='%PDF-1.4\n', offsets=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(output);output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(output,'ascii');
}
const twoColumn=()=>{
 const left=['CONTACT','EMAIL','maya@example.invalid','LANGUAGES','English - Fluent','Arabic - Native','SKILLS','Python (coursework only)','SQL (beginner)','Team communication'];
 const right=['Maya Vale','Junior Software Engineer','PROFESSIONAL SUMMARY','Junior developer with classroom API experience.','WORK EXPERIENCE','Software Engineer Intern | Example Systems','Jan 2024 - Jun 2024','- Built Python APIs for class, not production.','- Recorded manual testing results.','EDUCATION','BSc Computer Science (in progress)','Example University','Expected 2027'];
 return pdf([[...left.map((text,i)=>({text,x:30,y:730-i*25})),...right.map((text,i)=>({text,x:230,y:790-i*25}))]]);
};
const sidebar=['CONTACT','EMAIL','maya@example.invalid','SKILLS','Python (coursework only)','SQL (beginner)','Team communication'];
const main=['Maya Vale','Junior Software Engineer','PROFESSIONAL SUMMARY','Junior developer with classroom API experience.','WORK EXPERIENCE','Software Engineer Intern | Example Systems','Jan 2024 - Jun 2024','- Built Python APIs for class, not production.','- Recorded manual testing results.','EDUCATION','BSc Computer Science (in progress)','Example University','Expected 2027'];
const tableDocx=(extras={})=>docx([sidebar,main],true,extras);
const multirowDocx=()=>docx([[['SKILLS','Python','SQL'],['LANGUAGES','English','Arabic']],[['EDUCATION','College','2024'],['PROJECTS','Personal project','Description']]],'multi');
const continuationDocx=()=>docx([['Maya Vale','Junior Software Engineer','WORK EXPERIENCE','Software Engineer Intern | Example Systems','Jan 2024 - Jun 2024','- Recorded manual tests.'],['- Documented class exercises.','EDUCATION','BSc Computer Science (in progress)','Example University','Expected 2027']],true);
module.exports={simplePdf:()=>pdf([simple]),simpleDocx:()=>docx(),scannedPdf:()=>pdf([[]],true),multiPdf:()=>pdf([[...header,...bullets.slice(0,15)],[...bullets.slice(15),...end]]),twoColumn,tableDocx,multirowDocx,continuationDocx};
