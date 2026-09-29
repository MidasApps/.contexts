const ts=require(require('path').join(process.cwd(),'node_modules/.pnpm/@typescript+typescript6@6.0.2/node_modules/@typescript/typescript6'));
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=process.cwd();
const files=cp.execSync(`cd ${root} && find src app scripts proxy.ts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' -o -name '*.cjs' \\)`).toString().trim().split('\n');
const seg=new Map();
const split=s=>s.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').split(/[\s_\-$.]+/).filter(Boolean).map(x=>x.toLowerCase());
for(const f of files){const src=fs.readFileSync(path.join(root,f),'utf8');
 const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,f.endsWith('x')?ts.ScriptKind.TSX:undefined);
 const visit=n=>{if(ts.isIdentifier(n)||ts.isPrivateIdentifier(n)){for(const w of split(n.text)){seg.set(w,(seg.get(w)||0)+1)}}ts.forEachChild(n,visit)};visit(sf);
 for(const w of split(path.basename(f).replace(/\.[^.]+$/,'')))seg.set(w,(seg.get(w)||0)+1);
}
console.log([...seg].sort((a,b)=>b[1]-a[1]).map(([w,c])=>w+' '+c).join('\n'));
