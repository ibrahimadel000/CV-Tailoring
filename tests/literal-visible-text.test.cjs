// Offline text-projection contract. No provider, credentials, DOM or network.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {plainText,resumeBlocks}=load('components/builder/resumeModel');
const {createSampleProfile}=load('mock/profile');
const fixture=()=>createSampleProfile('Literal visible text QA');
const literal='Built CI_CD_pipeline with std::vector<int>, C# and user_id_key.';
for(const value of [literal,'EDITED_AFTER_TAILOR','user_id_key CI_CD_pipeline foo_bar __version__','std::map<string, std::vector<int>>','C# C++ C < D and E > F','Read <int> and <custom-token> literally.','أسماء_حقول_عربية and 日本_識別子','line_one\nline_two'])test('literal text survives: '+value,()=>assert.equal(plainText(value),value));
for(const [value,expected] of [
 ['**Bold** and _italic_ with <u>underline</u> and [a link](https://example.invalid)','Bold and italic with underline and a link'],
 ['_CI_CD_pipeline_ and **std::vector<int>**','CI_CD_pipeline and std::vector<int>'],
 ['<strong>Strong <em>emphasis</em></strong> and <b>bold</b> and <i>italic</i>','Strong emphasis and bold and italic'],
 ['<U>Old underline</U>','Old underline'],
 ['_one_ _two_ (_three_).','one two (three).'],
 ['\n1. Numbered\n• Bullet\n','1. Numbered\n• Bullet'],
])test('verified legacy inline syntax keeps visible content: '+value,()=>assert.equal(plainText(value),expected));
for(const value of ['<u>unclosed','orphan </u>','<b><i>crossed</b></i>','vector<i> and <u>known</u>','<u onclick="alert(1)">literal attributes</u>','<script>alert(1)</script>','<img src=x onerror=alert(1)>','&lt;int&gt; &amp; literal entities'])test('unrecognized or ambiguous markup remains inert literal text: '+value,()=>assert.equal(plainText(value),value));
test('projection is independent of browser globals and does not parse/inject HTML',()=>{const text='<script>globalThis.BAD=true</script> '+literal;assert.equal(plainText(text),text);assert.equal(globalThis.BAD,undefined);assert.equal(plainText(), '');assert.equal(plainText('   '),'');});
test('all resumeBlocks narrative paths preserve literals without mutating the native profile',()=>{const p=fixture();p.summary.data=literal;p.experience.data[0].description=literal;p.experience.data[0].bullets[0].text=literal;p.education.data[0].description=literal;p.projects.data=[{id:crypto.randomUUID(),name:'Literal project',bullets:[{id:crypto.randomUUID(),text:literal,isVerified:false}]}];p.customSections=[{id:crypto.randomUUID(),title:'Custom literal',kind:'text',paragraphs:[literal]},{id:crypto.randomUUID(),title:'Custom list',kind:'list',paragraphs:[literal]},{id:crypto.randomUUID(),title:'Custom skill',kind:'skills',paragraphs:[literal]},{id:crypto.randomUUID(),title:'Custom experience',kind:'experience',paragraphs:[],entries:[{id:crypto.randomUUID(),title:literal,organization:literal,location:literal,startDate:'2020',endDate:'2024',description:literal}]}];const before=JSON.stringify(p),blocks=resumeBlocks(p);assert.equal(JSON.stringify(p),before);for(const id of ['summary','experience','education','projects',...p.customSections.map(s=>'custom:'+s.id)])assert(JSON.stringify(blocks.find(b=>b.id===id)).includes(literal),id);});
test('an edit persists through JSON reopen and visible projection with exact source names',()=>{const p=fixture();p.summary.data=literal+' EDITED_AFTER_TAILOR';const reopened=JSON.parse(JSON.stringify(p));assert.equal(resumeBlocks(reopened).find(b=>b.id==='summary').items[0].text,p.summary.data);});

test('unmatched repeated italic openings stay literal without scanning across later openings',()=>{const text='_a '.repeat(12000).trim();assert.equal(plainText(text),text);});
