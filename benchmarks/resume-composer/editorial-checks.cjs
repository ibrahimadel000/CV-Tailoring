/** Offline editorial observations, NOT semantic verification or a save gate.
 * Full-sentence repetition is a review lead, not proof that a summary is poor.
 * Job relevance and truthful inference deliberately remain unassessed.
 */
const {createHash}=require('node:crypto');
const key=s=>s.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();
function sentences(text){
 return [...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text||'')]
  .map(s=>({quote:s.segment.trim(),offset:s.index})).filter(s=>s.quote);
}
function editorialObservations(profile){
 const summary=sentences(profile.summary.data),passages=[];
 for(const [section,label] of [['experience','experience'],['projects','projects']])
  for(const [i,e] of profile[section].data.entries()){
   if(e.description)passages.push({path:`${label}.${i}.overview`,text:e.description});
   for(const [j,b] of e.bullets.entries())passages.push({path:`${label}.${i}.bullets.${j}`,text:b.text});
  }
 const findings=[];
 for(const [i,s] of summary.entries()){
  const matches=passages.flatMap(p=>sentences(p.text).filter(t=>key(t.quote)===key(s.quote)).map(t=>({path:p.path,quote:t.quote})));
  if(matches.length)findings.push({code:'summary_repeats_entry_sentence',path:`summary.sentences.${i}`,quote:s.quote,matches});
  const earlier=summary.slice(0,i).findIndex(t=>key(t.quote)===key(s.quote));
  if(earlier>=0)findings.push({code:'summary_repeats_its_sentence',path:`summary.sentences.${i}`,quote:s.quote,earlierPath:`summary.sentences.${earlier}`});
 }
 return {basis:'Exact sentence repetition only; no quality score or semantic verdict.',
  documentHash:createHash('sha256').update(JSON.stringify(profile)).digest('hex'),
  unassessed:['job_relevance','semantic_faithfulness','writing_quality','appropriate_omissions'],findings};
}
module.exports={editorialObservations};
