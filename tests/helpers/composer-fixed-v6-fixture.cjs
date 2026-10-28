// Explicit authored fixture, not a runtime migration or repair.
const legacy=require('./composer-editorial-v4-fixture.cjs');
function fixed(raw){const summaryBlocks={profile:{text:'',sourceIds:[]},experience:{text:'',sourceIds:[]},skills:{text:'',sourceIds:[]},qualification:{text:'',sourceIds:[]}};for(const {kind,...claim}of raw.summaryClaims){if(summaryBlocks[kind].text)throw Error('Fixture requires one block per kind');summaryBlocks[kind]=claim;}const{summaryClaims,...rest}=raw;return{summaryBlocks,...rest};}
module.exports={...legacy,fixed,response:p=>fixed(legacy.response(p))};
