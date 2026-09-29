const fs=require('fs'),cp=require('child_process');const root=process.cwd();
const files=cp.execSync(`cd ${root} && ls scripts/lib/*schema*.mjs scripts/seed-*contract*.mjs scripts/onboarding-lote-2026-09/atributos-*.mjs scripts/seed-real-estate-client.mjs scripts/seed-vila-rosa-client.mjs 2>/dev/null`).toString().trim().split('\n');
const v=new Set();for(const f of files){const s=fs.readFileSync(root+'/'+f,'utf8');for(const m of s.matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g))v.add(m[1]);for(const m of s.matchAll(/^\s*([a-z][a-z0-9_]*)\s*:/gm))v.add(m[1])}
fs.writeFileSync(__dirname+'/vocab.json',JSON.stringify([...v]));console.log(files.join(' '),v.size);
