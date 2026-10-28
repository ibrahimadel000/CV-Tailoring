// Explicit authored offline fixture. Not a runtime conversion or model-quality verdict.
const legacy=require('./composer-editorial-v4-fixture.cjs');
function natural(raw){const {summaryClaims,...rest}=raw;return{summarySegments:summaryClaims.map(({kind,...segment})=>segment),...rest};}
module.exports={...legacy,natural,response:p=>natural(legacy.response(p))};
