// Explicit prepared v5 fixture; never a runtime compatibility path.
const legacy=require('./composer-editorial-v4-fixture.cjs');
function grouped(raw){const summaryClaims={profile:[],experience:[],skills:[],qualification:[]};for(const {kind,...claim}of raw.summaryClaims)summaryClaims[kind].push(claim);return{...raw,summaryClaims};}
module.exports={...legacy,grouped,response:p=>grouped(legacy.response(p))};
