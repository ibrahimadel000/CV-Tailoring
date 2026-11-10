// Offline TS/TSX module loader for Node tests: no browser, network or provider.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),cache=new Map();
function resolveFile(base){
 for(const ext of ['.tsx','.ts']) if(fs.existsSync(base+ext)) return base+ext;
 return null;
}
function load(file){
 file=path.resolve(file);
 if(cache.has(file)) return cache.get(file).exports;
 const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(root);
 const normal=m.require.bind(m);
 m.require=id=>{
  if(id.startsWith('@/')){const f=resolveFile(path.join(root,'src',id.slice(2)));if(f)return load(f);}
  if(id.startsWith('.')){const f=resolveFile(path.resolve(path.dirname(file),id));if(f)return load(f);}
  return normal(id);
 };
 cache.set(file,m);
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8')
  .replaceAll('import.meta.env.DEV','false').replaceAll('import.meta.env.VITE_GEMINI_API_KEY',"''"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
 return m.exports;
}
module.exports={root,load:p=>load(resolveFile(path.join(root,'src',p)))};
