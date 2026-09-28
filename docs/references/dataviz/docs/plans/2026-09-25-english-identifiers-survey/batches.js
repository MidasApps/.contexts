const o=require('./occcat.json');const fnm=require('./filenames.json');
const B=[
['B01 shared/lib/metrics',f=>f.startsWith('src/shared/lib/metrics/')],
['B02 shared/lib (bigquery, report, export)',f=>/^src\/shared\/lib\/(bigquery|report|export)\//.test(f)],
['B03 shared/lib (chat, firestore, memory, rest)',f=>f.startsWith('src/shared/lib/')&&!/^src\/shared\/lib\/(metrics|bigquery|report|export)\//.test(f)],
['B04 shared/config + stores + repositories + schemas + ui',f=>/^src\/shared\/(config|stores|repositories|schemas|ui|providers)\//.test(f)],
['B05 shared/hooks',f=>f.startsWith('src/shared/hooks/')],
['B06 features/report-authoring',f=>f.startsWith('src/features/report-authoring/')],
['B07 features/ai-agents lib+mastra+root',f=>f.startsWith('src/features/ai-agents/')&&!f.startsWith('src/features/ai-agents/tools/')],
['B08 features/ai-agents/tools metrics+page-filters+bqml',f=>/^src\/features\/ai-agents\/tools\/(metrics|page-filters|bqml)\//.test(f)],
['B09 features/ai-agents/tools (analytics)',f=>/^src\/features\/ai-agents\/tools\/[^/]+$/.test(f)||/^src\/features\/ai-agents\/tools\/__tests__\//.test(f)],
['B10 features (templates, admin, ai-studio, business-context, evals)',f=>/^src\/features\/(templates|admin|ai-studio|business-context|evals|auth|sql-catalog)\//.test(f)],
['B11 pages/explore/ui/blocks helpers (.ts)',f=>f.startsWith('src/pages/explore/ui/blocks/')&&/\.ts$/.test(f)&&!/\.test\.tsx?$/.test(f)||/^src\/pages\/explore\/ui\/blocks\/__tests__\/.*\.test\.ts$/.test(f)],
['B12 pages/explore/ui/blocks components (.tsx)',f=>f.startsWith('src/pages/explore/ui/blocks/')&&/\.tsx$/.test(f)],
['B13 pages/explore/ui root',f=>f.startsWith('src/pages/explore/')&&!f.startsWith('src/pages/explore/ui/blocks/')],
['B14 pages/report + landing + home + admin-*',f=>f.startsWith('src/pages/')&&!/^src\/pages\/(explore|prototypes)\//.test(f)],
['B15 pages/prototypes',f=>f.startsWith('src/pages/prototypes/')],
['B16 widgets ai-sidebar + chat-sidebar',f=>/^src\/widgets\/(ai-sidebar|chat-sidebar)\//.test(f)],
['B17 widgets (rest)',f=>f.startsWith('src/widgets/')&&!/^src\/widgets\/(ai-sidebar|chat-sidebar)\//.test(f)],
['B18 app (api + routes) + src/app + src/mastra',f=>f.startsWith('app/')||/^src\/(app|mastra)\//.test(f)||f==='proxy.ts'],
['B19 scripts/lib + metrics + templates',f=>/^scripts\/(lib|metrics|templates|cron|shims|datasets)\//.test(f)],
['B20 scripts root (.ts/.mjs) + __tests__',f=>/^scripts\/[^/]+$/.test(f)||f.startsWith('scripts/__tests__/')],
['B21 scripts/onboarding-lote-2026-09',f=>f.startsWith('scripts/onboarding-lote-2026-09/')],
];
const used=new Set();
for(const [k,fn] of B){const xs=o.filter(x=>fn(x.f)&&(x.cat==='B-prop'||x.cat==='C-local'));xs.forEach(x=>used.add(x.f));
 const keep=o.filter(x=>fn(x.f)&&x.cat.startsWith('P'));
 console.log(k.padEnd(62),'names',String(new Set(xs.map(x=>x.name)).size).padStart(4),'occ',String(xs.length).padStart(5),'files',String(new Set(xs.map(x=>x.f)).size).padStart(3),'(tests',new Set(xs.filter(x=>x.test).map(x=>x.f)).size+')','ptFileNames',fnm.filter(x=>fn(x.f)).length,'keep(P)',[...new Set(keep.map(x=>x.name))].join(','))}
const all=new Set(o.filter(x=>x.cat==='B-prop'||x.cat==='C-local').map(x=>x.f));console.log('unassigned',[...all].filter(f=>!used.has(f)));
