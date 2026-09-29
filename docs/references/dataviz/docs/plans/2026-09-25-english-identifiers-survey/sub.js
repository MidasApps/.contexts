const o=require('./occcat.json');
const sub=(pref,depth)=>{const m=new Map();for(const x of o){if(!x.f.startsWith(pref))continue;if(!(x.cat==='B-prop'||x.cat==='C-local'))continue;const p=x.f.replace(/\/__tests__/,'').split('/');const k=p.slice(0,Math.min(depth,p.length-1)).join('/')+(p.length-1<depth?'/*':'');const e=m.get(k)||{names:new Set(),files:new Set(),occ:0};e.names.add(x.name);e.files.add(x.f);e.occ++;m.set(k,e)}
console.log('== '+pref);for(const [k,e] of [...m].sort((a,b)=>b[1].names.size-a[1].names.size))console.log(k.padEnd(58),String(e.names.size).padStart(4),String(e.occ).padStart(5),'files:'+e.files.size)};
for(const [p,d] of JSON.parse(process.argv[2]))sub(p,d);
