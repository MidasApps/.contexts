const ts=require(require('path').join(process.cwd(),'node_modules/.pnpm/@typescript+typescript6@6.0.2/node_modules/@typescript/typescript6'));
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {analyze}=require('./words.js');
const root=process.cwd();
const EXCLUDE=new Set(`src/features/ai-studio/runtime/redact-tool-errors.ts src/features/ai-agents/lib/recalled-sql.ts src/features/ai-studio/runtime/implied-tools.ts src/pages/report/ui/auto-fill-prompt.ts src/pages/admin-agent-quality/ui/judge-filter.ts src/features/ai-agents/tools/bq-dry-run.ts src/features/ai-agents/lib/format-error.ts src/features/ai-agents/tools/get-table-schema-v2.ts src/features/ai-agents/tools/bqml/list-models.ts src/features/ai-agents/tools/metrics/guard-metric-template.ts src/shared/lib/bigquery/__tests__/query-byte-cap.test.ts src/shared/lib/bigquery/warm-known-project-ids.ts src/features/ai-agents/lib/client-query-scope.ts`.split(' '));
const files=cp.execSync(`cd ${root} && find src app scripts proxy.ts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' -o -name '*.cjs' \\)`).toString().trim().split('\n').filter(f=>!EXCLUDE.has(f));
const isTest=f=>/(__tests__|\.test\.|\.spec\.)/.test(f)||/\/test-/.test(f);
const moduleOf=f=>{const p=f.split('/');
 if(p[0]==='src'&&['features','pages','widgets'].includes(p[1]))return p.slice(0,3).join('/');
 if(p[0]==='src'&&p[1]==='shared'){if(p.length>4)return p.slice(0,4).join('/');return p.slice(0,3).join('/')}
 if(p[0]==='src')return p.slice(0,2).join('/');
 if(p[0]==='app'&&p[1]==='api')return p.slice(0,3).join('/');
 if(p[0]==='app')return p.length>2?p.slice(0,2).join('/'):'app';
 if(p[0]==='scripts')return p.length>2?p.slice(0,2).join('/'):'scripts';
 return p[0]};
const areaOf=f=>{const p=f.split('/');if(p[0]==='src'&&['features','pages','widgets','shared'].includes(p[1]))return 'src/'+p[1];if(p[0]==='src')return 'src/(other)';if(p[0]==='app'&&p[1]==='api')return 'app/api';if(p[0]==='app')return 'app/(routes)';return p[0]};
const out=[];const fileNames=[];const topFns=[];
const kindOf=(id)=>{const p=id.parent;
 if(!p)return 'ref';
 if((ts.isVariableDeclaration(p)||ts.isFunctionDeclaration(p)||ts.isClassDeclaration(p)||ts.isInterfaceDeclaration(p)||ts.isTypeAliasDeclaration(p)||ts.isEnumDeclaration(p)||ts.isParameter(p)||ts.isTypeParameterDeclaration(p)||ts.isFunctionExpression(p))&&p.name===id)return 'decl';
 if(ts.isBindingElement(p)&&p.name===id)return p.propertyName?'decl':'decl+prop';
 if(ts.isBindingElement(p)&&p.propertyName===id)return 'propref';
 if((ts.isPropertySignature(p)||ts.isPropertyDeclaration(p)||ts.isPropertyAssignment(p)||ts.isMethodSignature(p)||ts.isMethodDeclaration(p)||ts.isGetAccessor(p)||ts.isSetAccessor(p)||ts.isEnumMember(p))&&p.name===id)return 'propdecl';
 if(ts.isShorthandPropertyAssignment(p))return 'propdecl';
 if(ts.isPropertyAccessExpression(p)&&p.name===id)return 'propref';
 if(ts.isJsxAttribute(p))return 'propref';
 if(ts.isImportSpecifier(p)||ts.isExportSpecifier(p)||ts.isImportClause(p)||ts.isNamespaceImport(p))return 'import';
 if(ts.isQualifiedName(p)&&p.right===id)return 'ref';
 return 'ref'};
const inZodObject=(n)=>{let c=n;while(c){if(ts.isCallExpression(c)&&/(^|\.)(object|strictObject|looseObject)$/.test(c.expression.getText())&&/^z\b|z\./.test(c.expression.getText()))return true;c=c.parent}return false};
for(const f of files){const src=fs.readFileSync(path.join(root,f),'utf8');
 const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,f.endsWith('x')?ts.ScriptKind.TSX:(f.endsWith('js')||f.endsWith('mjs')||f.endsWith('cjs'))?ts.ScriptKind.JS:ts.ScriptKind.TS);
 const base=path.basename(f).replace(/\.(test|spec)?\.?[^.]+$/,'').replace(/\.(test|spec)$/,'');
 const fa=analyze(base);if(fa.pt.length)fileNames.push({f,pt:fa.pt});
 for(const st of sf.statements)if(ts.isFunctionDeclaration(st))topFns.push({f,name:st.name&&st.name.text});
 const visit=n=>{
  let name=null,kind=null;
  if(ts.isIdentifier(n)){name=n.text;kind=kindOf(n)}
  else if(ts.isStringLiteral(n)&&n.parent&&(ts.isPropertyAssignment(n.parent)||ts.isPropertySignature(n.parent))&&n.parent.name===n){name=n.text;kind='propdecl-quoted'}
  if(name){const a=analyze(name);if(a.pt.length){const line=sf.getLineAndCharacterOfPosition(n.getStart()).line+1;
   const snake=/_/.test(name)&&name===name.toLowerCase();
   out.push({f,module:moduleOf(f),area:areaOf(f),test:isTest(f),name,kind,snake,mixed:a.mixed,pt:a.pt,zod:kind&&kind.startsWith('propdecl')?inZodObject(n):false,line})}}
  ts.forEachChild(n,visit)};visit(sf)}
fs.writeFileSync('occ.json',JSON.stringify(out));fs.writeFileSync('filenames.json',JSON.stringify(fileNames));fs.writeFileSync('topfns.json',JSON.stringify(topFns));
console.log('files',files.length,'occ',out.length,'ptFileNames',fileNames.length,'topFns',topFns.length);
