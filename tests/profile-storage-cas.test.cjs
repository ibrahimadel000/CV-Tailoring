// Canonical IndexedDB CAS/migration is covered in real-browser tests.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/editorial-loader.cjs');
const {recoveryJson}=load('store/jsonRecovery');
test('JSON recovery accepts only a plain, tree-shaped JSON representation',()=>{
 const value={profiles:[{name:'fictional',n:2}],active:null};assert.deepEqual(JSON.parse(recoveryJson(value)),value);
 for(const invalid of [new Map([['x',1]]),new Date(),{x:undefined},{x:NaN},[undefined],Array(1),{x:1n},{x:-0}]) assert.throws(()=>recoveryJson(invalid));
 const cycle={};cycle.self=cycle;assert.throws(()=>recoveryJson(cycle));const shared={x:1};assert.throws(()=>recoveryJson({a:shared,b:shared}));
});
