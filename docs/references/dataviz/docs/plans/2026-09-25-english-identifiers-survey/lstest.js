const ts=require(require('path').join(process.cwd(),'node_modules/.pnpm/@typescript+typescript6@6.0.2/node_modules/@typescript/typescript6'));
const path=require('path'),fs=require('fs');const root=process.cwd();
const t0=Date.now();
const cfg=ts.getParsedCommandLineOfConfigFile(root+'/tsconfig.json',{},{...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>console.error(d.messageText)});
const files=cfg.fileNames.filter(f=>!f.includes('/.next/'));
const host={getScriptFileNames:()=>files,getScriptVersion:()=>'1',getScriptSnapshot:f=>fs.existsSync(f)?ts.ScriptSnapshot.fromString(fs.readFileSync(f,'utf8')):undefined,getCurrentDirectory:()=>root,getCompilationSettings:()=>cfg.options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory,directoryExists:ts.sys.directoryExists,getDirectories:ts.sys.getDirectories};
const ls=ts.createLanguageService(host,ts.createDocumentRegistry());
const f=root+'/src/features/report-authoring/schema/block-specs.ts';const src=fs.readFileSync(f,'utf8');
for(const name of ['larguraDe','FaixaDeLargura','familiaDeAltura']){const pos=src.indexOf(name);
const locs=ls.findRenameLocations(f,pos+1,false,false,{providePrefixAndSuffixTextForRename:true})||[];
const byFile={};for(const l of locs){const r=path.relative(root,l.fileName);byFile[r]=(byFile[r]||0)+1}
console.log(name,locs.length,'locs in',Object.keys(byFile).length,'files; prefix/suffix:',locs.filter(l=>l.prefixText||l.suffixText).length)}
const e=ls.getEditsForFileRename(f,root+'/src/features/report-authoring/schema/block-specs-x.ts',{},{});
console.log('fileRename edits in',e.length,'files');
console.log('files in program',files.length,'ms',Date.now()-t0);
