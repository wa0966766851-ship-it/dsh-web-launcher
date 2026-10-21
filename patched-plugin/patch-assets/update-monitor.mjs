import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const projects=[
  {name:'Our Free Model',repo:'Ebony-Vinyl/dsh-our-free-model',id:1385896447},
  {name:'DSH 啟動台',repo:'wa0966766851-ship-it/dsh-web-launcher',id:1421636982},
  {name:'DeepSeek Harness',repo:'deepseek-ai/deepseek-harness',id:1333065091},
];
export function compareVersions(a,b){
  const parse=v=>{const m=/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/.exec(v||'');if(!m)throw Error('無法辨識版本：'+v);return m;};
  const x=parse(a),y=parse(b);for(let n=1;n<=3;n++)if(+x[n]!==+y[n])return Math.sign(+x[n]-+y[n]);
  if(x[4]===y[4])return 0;if(!x[4])return 1;if(!y[4])return -1;
  const p=x[4].split('.'),q=y[4].split('.');for(let n=0;n<Math.max(p.length,q.length);n++){
    if(p[n]===q[n])continue;if(p[n]===undefined)return -1;if(q[n]===undefined)return 1;
    const pn=/^\d+$/.test(p[n]),qn=/^\d+$/.test(q[n]);
    if(pn&&qn)return Math.sign(+p[n]-+q[n]);if(pn!==qn)return pn?-1:1;return p[n]<q[n]?-1:1;
  }return 0;
}
export async function inspectProject(project,{fetchImpl=fetch,installed=''}={}){
  const get=async url=>{const r=await fetchImpl(url,{headers:{'User-Agent':'DSHLauncher-update-check','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('GitHub HTTP '+r.status);return r.json();};
  let info;try{info=await get('https://api.github.com/repositories/'+project.id);}catch{return inspectProjectPage(project,{fetchImpl,installed});}
  if(info.id!==project.id)throw Error('專案識別碼不符；保留目前版本。');
  const moved=info.full_name.toLowerCase()!==project.repo.toLowerCase();
  const result={name:project.name,repo:info.full_name,expectedRepo:project.repo,moved,archived:!!info.archived,url:info.html_url,installed};
  if(moved||info.archived)return {...result,status:moved?'moved':'archived'};
  let content;try{content=await get('https://api.github.com/repos/'+project.repo+'/contents/package.json');}catch{return inspectProjectPage(project,{fetchImpl,installed});}
  const pkg=JSON.parse(Buffer.from(content.content,'base64').toString('utf8'));
  result.version=pkg.version;result.sourceHash=content.sha;
  result.status=installed?(compareVersions(pkg.version,installed)>0?'available':compareVersions(pkg.version,installed)<0?'ahead':'current'):'observed';
  return result;
}
// GitHub's anonymous API quota is shared by the network egress. Its public
// repository page exposes the same stable repository ID without that API quota.
// Refuse the fallback if these identity fields disappear; never guess a mirror.
async function inspectProjectPage(project,{fetchImpl,installed}){
  const page=await fetchImpl('https://github.com/'+project.repo,{signal:AbortSignal.timeout(12000)});
  if(!page.ok)throw Error('GitHub 頁面 HTTP '+page.status);
  const html=await page.text();
  const id=html.match(/<meta name="octolytics-dimension-repository_id" content="(\d+)"/)?.[1];
  const repo=html.match(/<meta name="octolytics-dimension-repository_nwo" content="([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/)?.[1];
  if(Number(id)!==project.id||!repo)throw Error('備援頁面的專案識別碼不符；保留目前版本。');
  const moved=repo.toLowerCase()!==project.repo.toLowerCase(),archived=html.includes('This repository was archived by the owner');
  const result={name:project.name,repo,expectedRepo:project.repo,moved,archived,installed,url:'https://github.com/'+repo,source:'github-page'};
  if(moved||archived)return {...result,status:moved?'moved':'archived'};
  const branch=html.match(/"defaultBranch":"([A-Za-z0-9_./-]+)"/)?.[1];
  if(!branch)throw Error('無法確認上游預設分支；保留目前版本。');
  const response=await fetchImpl('https://raw.githubusercontent.com/'+repo+'/'+encodeURIComponent(branch)+'/package.json',{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('上游版本查詢 HTTP '+response.status);
  const pkg=await response.json();
  return {...result,version:pkg.version,status:installed?(compareVersions(pkg.version,installed)>0?'available':compareVersions(pkg.version,installed)<0?'ahead':'current'):'observed'};
}
export async function checkUpdates(home,{force=false,installed={},fetchImpl=fetch}={}){
  const dir=path.join(home,'our-free-model'),file=path.join(dir,'update-monitor.json');
  let previous;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  if(!force&&previous&&Date.now()-previous.checkedAt<6*3600000)return {...previous,projects:previous.projects.map(p=>{
    const current=installed[p.name]||'';
    if(!current||!p.version||!['current','available','observed','ahead'].includes(p.status))return p;
    try{return {...p,installed:current,status:compareVersions(p.version,current)>0?'available':compareVersions(p.version,current)<0?'ahead':'current'};}catch{return p;}
  })};
  const results=await Promise.all(projects.map(async p=>{try{return await inspectProject(p,{fetchImpl,installed:installed[p.name]||''});}catch(e){return {name:p.name,repo:p.repo,status:'unavailable',error:e.message,lastKnown:previous?.projects?.find(x=>x.name===p.name)?.version||null};}}));
  const snapshot={checkedAt:Date.now(),projects:results,automaticInstall:false};
  fs.mkdirSync(dir,{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(snapshot,null,2));fs.renameSync(tmp,file);
  return snapshot;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--compare')console.log(compareVersions(process.argv[3],process.argv[4]));
