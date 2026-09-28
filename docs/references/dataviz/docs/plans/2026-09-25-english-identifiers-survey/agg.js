const fs=require('fs');const o=require('./occ.json');const root=process.cwd();
const byName=new Map();
for(const x of o){const e=byName.get(x.name)||{name:x.name,n:0,kinds:new Set(),files:new Set(),modules:new Set(),zod:false,snake:x.snake,testOnly:true};e.n++;e.kinds.add(x.kind);e.files.add(x.f);e.modules.add(x.module);if(x.zod)e.zod=true;if(!x.test)e.testOnly=false;byName.set(x.name,e)}
const bucket=e=>{if(e.snake||/\./.test(e.name)||/^[a-z0-9_]+$/.test(e.name)&&e.name.includes('_'))return 'A-data';
 if([...e.kinds].some(k=>k.startsWith('prop')||k==='decl+prop'))return 'B-prop';return 'C-local'};
for(const e of byName.values())e.bucket=bucket(e);
// string-literal presence of camelCase prop names
const all=require('child_process').execSync(`cd ${root} && find src app scripts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \\) -print0 | xargs -0 cat`,{maxBuffer:1e9}).toString();
const rules=fs.readFileSync(root+'/firestore.rules','utf8')+fs.readFileSync(root+'/firestore.indexes.json','utf8');
for(const e of byName.values())if(e.bucket==='B-prop'){const re=new RegExp(`['"\`]${e.name}['"\`]`);e.strLit=re.test(all);e.inRules=new RegExp(`\\b${e.name}\\b`).test(rules)}
const summ={};for(const e of byName.values()){summ[e.bucket]=(summ[e.bucket]||0)+1}
console.log('unique names by bucket',summ);
const B=[...byName.values()].filter(e=>e.bucket==='B-prop');
console.log('B zod',B.filter(e=>e.zod).length,'B strLit',B.filter(e=>e.strLit).length,'B inRules',B.filter(e=>e.inRules).map(e=>e.name));
console.log('testOnly names',[...byName.values()].filter(e=>e.testOnly).length);
fs.writeFileSync('names.json',JSON.stringify([...byName.values()].map(e=>({...e,kinds:[...e.kinds],files:[...e.files],modules:[...e.modules]}))));
