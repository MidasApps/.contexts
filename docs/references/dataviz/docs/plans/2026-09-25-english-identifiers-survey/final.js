const fs=require('fs');const o=require('./occ.json');const vocab=new Set(require('./vocab.json'));
const fileNames=require('./filenames.json');const topFns=require('./topfns.json');
const TOOLPARAMS=new Set('entidade intencao confirmado topico horizonte valorEmissao parametro valores cenario maxDiasAtraso maxMeses custoObrigacoes metrica tratamentoColuna tratamentoValor dataCortePre topSafras acao orcamento campo motivo filtro desemprego textos periodoBefore periodoAfter metricas dataBaseAnterior safraWindowEnd limitePct substituiBlockId posicao legendaInterativa ordem inadimplencia_max elegibilidade_min'.split(' '));
const PERSISTED=new Set('legendaInterativa mostrarConversao etapas fluxos ordem grupos fatias projetos etapa origem destino grupo mediana'.split(' '));
const isIdent=s=>/^[A-Za-z_$][\w$]*$/.test(s);
const cat=x=>{const n=x.name;const prop=x.kind.startsWith('prop')||x.kind==='decl+prop';
 if(!isIdent(n))return 'A-datakey';
 if(/_/.test(n)&&n===n.toLowerCase())return 'A-datakey';
 if(prop&&(TOOLPARAMS.has(n)&&x.f.match(/ai-agents\/tools|report-authoring\/tools|mastra\/authoring-tools/)))return 'P-toolparam';
 if(prop&&PERSISTED.has(n))return 'P-persisted';
 if(prop&&vocab.has(n))return 'A-contract';
 if(prop)return 'B-prop';
 return 'C-local'};
for(const x of o)x.cat=cat(x);fs.writeFileSync("occcat.json",JSON.stringify(o));
const EXCL_TOP=new Set();
const agg=(keyFn)=>{const m=new Map();for(const x of o){const k=keyFn(x);if(!k)continue;const e=m.get(k)||{occ:0,names:new Set(),rn:new Set(),rocc:0,prop:new Set(),local:new Set(),testrn:new Set(),dont:new Set(),persist:new Set(),mixed:new Set()};
 e.occ++;e.names.add(x.name);
 if(x.cat==='B-prop'||x.cat==='C-local'){e.rn.add(x.name);e.rocc++;if(x.cat==='B-prop')e.prop.add(x.name);else e.local.add(x.name);if(x.test)e.testrn.add(x.name);if(x.mixed)e.mixed.add(x.name)}
 else if(x.cat.startsWith('P'))e.persist.add(x.name);else e.dont.add(x.name);
 m.set(k,e)}return m};
const fmt=(m,files)=>[...m].map(([k,e])=>({k,rename:e.rn.size,renameOcc:e.rocc,prop:e.prop.size,local:e.local.size,mixed:e.mixed.size,persist:e.persist.size,dont:e.dont.size,ptFiles:fileNames.filter(f=>files(f.f)===k).length}));
const areaOf=f=>{const p=f.split('/');if(p[0]==='src'&&['features','pages','widgets','shared'].includes(p[1]))return 'src/'+p[1];if(p[0]==='src')return 'src/(other)';if(p[0]==='app'&&p[1]==='api')return 'app/api';if(p[0]==='app')return 'app/(routes)';return p[0]};
const moduleOf=x=>x.module;
const modOfFile=f=>{const r=o.find(x=>x.f===f);if(r)return r.module;const p=f.split('/');if(p[0]==='src'&&['features','pages','widgets'].includes(p[1]))return p.slice(0,3).join('/');if(p[0]==='src'&&p[1]==='shared')return p.length>4?p.slice(0,4).join('/'):p.slice(0,3).join('/');if(p[0]==='scripts')return p.length>2?p.slice(0,2).join('/'):'scripts';if(p[0]==='app'&&p[1]==='api')return p.slice(0,3).join('/');return p.slice(0,2).join('/')};
const A=fmt(agg(x=>areaOf(x.f)),f=>areaOf(f)).sort((a,b)=>b.rename-a.rename);
const M=fmt(agg(moduleOf),modOfFile).sort((a,b)=>b.rename-a.rename);
// global
const g={};for(const c of ['A-datakey','A-contract','P-toolparam','P-persisted','B-prop','C-local']){g[c]={names:new Set(o.filter(x=>x.cat===c).map(x=>x.name)).size,occ:o.filter(x=>x.cat===c).length}}
const rn=o.filter(x=>x.cat==='B-prop'||x.cat==='C-local');
g.renameUniqueNames=new Set(rn.map(x=>x.name)).size;g.renameOcc=rn.length;g.renameFiles=new Set(rn.map(x=>x.f)).size;g.renameProdFiles=new Set(rn.filter(x=>!x.test).map(x=>x.f)).size;g.renameTestFiles=new Set(rn.filter(x=>x.test).map(x=>x.f)).size;
g.mixed=new Set(rn.filter(x=>x.mixed).map(x=>x.name)).size;g.ptFileNames=fileNames.length;g.topLevelFunctionDecls=topFns.length;g.topFnFiles=new Set(topFns.map(t=>t.f)).size;
// topFns per area
const tf={};for(const t of topFns){const a=areaOf(t.f);tf[a]=(tf[a]||0)+1}g.topFnsByArea=tf;
// decl vs moduleName counts for declarations only (exported?)
fs.writeFileSync('final.json',JSON.stringify({g,A,M},null,1));
console.log(JSON.stringify(g,null,1));console.table(A);console.table(M.slice(0,60));
