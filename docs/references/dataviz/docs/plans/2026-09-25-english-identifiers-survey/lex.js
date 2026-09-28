const fs=require('fs');
const fold=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const pt=new Set();
for(const l of fs.readFileSync('pt50k.txt','utf8').split('\n')){const w=l.split(' ')[0];if(w)pt.add(fold(w))}
for(const l of fs.readFileSync('package/index.dic','utf8').split('\n').slice(1)){const w=l.split('/')[0];if(w&&!/[A-Z]/.test(w[0]))pt.add(fold(w))}
const en=new Set(fs.readFileSync('/usr/share/dict/words','utf8').split('\n').map(x=>x.toLowerCase()));
fs.writeFileSync('ptset.json',JSON.stringify([...pt]));
const segs=fs.readFileSync('segments.txt','utf8').trim().split('\n').map(l=>l.split(' '));
const out={ptNonEn:[],ptAndEn:[],neither:[]};
for(const [w,c] of segs){const p=pt.has(w),e=en.has(w);if(p&&!e)out.ptNonEn.push(w+':'+c);else if(p&&e)out.ptAndEn.push(w+':'+c);else if(!e)out.neither.push(w+':'+c)}
for(const k in out){fs.writeFileSync(k+'.txt',out[k].join(' '));console.log(k,out[k].length)}
