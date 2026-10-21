import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
export const appDir=path.dirname(fileURLToPath(import.meta.url));
export const dshHome=path.resolve(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'));
export const runtime=path.join(appDir,'runtime');
export const shared=path.join(dshHome,'launcher');
export const configFile=path.join(appDir,'launcher.config.json');
export const outLog=path.join(shared,'server.stdout.log');
export const errLog=path.join(shared,'server.stderr.log');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const d of [runtime,shared])fs.mkdirSync(d,{recursive:true});
export function readJSON(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}}
export function writeJSON(file,value){const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
export function config(){return {port:3080,mode:'app',theme:'light',...readJSON(configFile,{})};}
export function validPort(n){if(!Number.isInteger(n)||n<1||n>65535)throw Error('連接埠必須是 1–65535 的整數。');return n;}
export function setConfig(patch){if(patch.port!==undefined)validPort(patch.port);const c={...config(),...patch};writeJSON(configFile,c);return c;}
export function cliPath(){return process.env.DSH_LAUNCHER_CLI||config().cliPath||path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'npm/node_modules/@deepseek-ai/dsh/lib/bin.js');}
export function redact(s){return String(s).replace(/([?&](?:token|t)=)[^\s&"'<>]+/gi,'$1[隱藏]').replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{15,})\b/g,'[隱藏]');}
export function exec(cmd,args){return new Promise(resolve=>execFile(cmd,args,{windowsHide:true,timeout:25000,maxBuffer:8e6},(error,stdout,stderr)=>resolve({ok:!error,code:error?.code,stdout:String(stdout||''),stderr:String(stderr||'')})));}
export function alive(pid){try{process.kill(Number(pid),0);return true;}catch{return false;}}
export async function withLock(name,fn){const file=path.join(shared,name+'.lock');const deadline=Date.now()+150000;for(;;){try{fs.writeFileSync(file,JSON.stringify({pid:process.pid}),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;const owner=readJSON(file);if(owner&&!alive(owner.pid)){try{fs.unlinkSync(file);}catch{}continue;}if(!owner&&Date.now()-fs.statSync(file).mtimeMs>10000){try{fs.unlinkSync(file);}catch{}continue;}if(Date.now()>deadline)throw Error('另一個啟動操作尚未完成，請稍後再試。');await sleep(300);}}try{return await fn();}finally{try{if(readJSON(file)?.pid===process.pid)fs.unlinkSync(file);}catch{}}}
export function parseUrls(text,port){const urls=[];for(const m of String(text).matchAll(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s)]+)/g)){try{const u=new URL(m[1]);if(u.port===String(port))urls.push(u.href);}catch{}}return urls.reverse();}
export async function validateUrl(url,port){try{const u=new URL(url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||Number(u.port)!==Number(port)||!u.searchParams.get('token'))return false;const boot=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(4000)});await boot.body?.cancel();if(boot.status!==303)return false;const cookie=boot.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');if(!cookie)return false;const page=await fetch(new URL('/',u),{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(4000)});const html=await page.text();return page.status===200&&/<!doctype html|<html/i.test(html);}catch{return false;}}
export async function portOwner(port){const {stdout}=await exec('netstat.exe',['-ano','-p','TCP']);for(const line of stdout.split(/\r?\n/)){const m=line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);if(m&&Number(m[1])===port)return Number(m[2]);}return null;}
export async function processInfo(pid){if(!pid)return null;const s=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress`]);return readJSONText(s.stdout);}
function readJSONText(s){try{return JSON.parse(s.replace(/^\uFEFF/,''));}catch{return null;}}
export function isDsh(info){if(!info||!/^node(?:\.exe)?$/i.test(info.Name||''))return false;const c=(info.CommandLine||'').replaceAll('\\','/').toLowerCase();return c.includes(cliPath().replaceAll('\\','/').toLowerCase())||/@deepseek-ai\/dsh\/lib\/bin\.js(?:["\s]|$)/i.test(c);}
export async function findUrl(port,pid){const state=readJSON(path.join(shared,'service.json'));const candidates=[];if(state?.pid===pid&&state.port===port)candidates.push(state.url);const files=[outLog,path.join(appDir,'runtime/server.stdout.log'),path.join(os.homedir(),'Desktop/DSH/runtime/server.stdout.log')];try{const backups=path.join(dshHome,'backups');for(const e of fs.readdirSync(backups,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('upgrade-')).slice(-3)){for(const f of fs.readdirSync(path.join(backups,e.name)).filter(f=>f.endsWith('.stdout.log')))files.push(path.join(backups,e.name,f));}}catch{}for(const f of [...new Set(files)]){try{candidates.push(...parseUrls(fs.readFileSync(f,'utf8').slice(-200000),port));}catch{}}for(const u of [...new Set(candidates.filter(Boolean))])if(await validateUrl(u,port)){writeJSON(path.join(shared,'service.json'),{pid,port,url:u});return u;}return null;}
export async function orbHelpers(){const root=path.join(dshHome,'dsh-orb/electron-runtime').replace(/'/g,"''");const s=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith('${root}\\', [StringComparison]::OrdinalIgnoreCase) } | Select-Object -ExpandProperty Id) | ConvertTo-Json -Compress`]);const value=readJSONText(s.stdout);return (Array.isArray(value)?value:value?[value]:[]).map(Number).filter(Number.isInteger);}
export async function status(port=config().port){validPort(port);const pid=await portOwner(port),info=await processInfo(pid),own=isDsh(info);const url=own?await findUrl(port,pid):null;let profiles=[],plugins=[];try{profiles=fs.readdirSync(path.join(dshHome,'profiles'),{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='node_modules').map(d=>d.name);}catch{}plugins=readJSON(path.join(dshHome,'profiles/web/package.json'),{})?.dsh?.profile?.bundles||[];const helpers=await orbHelpers();return {running:own,ready:Boolean(url),port,pid:own?pid:null,foreignPid:own?null:pid,foreignName:own?null:info?.Name,url,mode:config().mode,theme:config().theme,nodeVersion:process.version,cliPath:cliPath(),cliExists:fs.existsSync(cliPath()),dshHome,profiles,plugins,orbHelpers:helpers.length};}
async function stopInner(port,log){const pid=await portOwner(port);if(pid&&!isDsh(await processInfo(pid)))throw Error(`連接埠 ${port} 由其他程式使用（PID ${pid}），已保留該程式。`);if(pid){log(`正在停止 DSH（PID ${pid}）…`);const killed=await exec('taskkill.exe',['/PID',String(pid),'/T','/F']);if(!killed.ok&&alive(pid))throw Error('無法停止 DSH，請檢查程序權限。');}for(const h of await orbHelpers())await exec('taskkill.exe',['/PID',String(h),'/F']);const deadline=Date.now()+20000;while(await portOwner(port)){if(Date.now()>deadline)throw Error('連接埠尚未釋放，已停止重新啟動。');await sleep(300);}try{fs.unlinkSync(path.join(shared,'service.json'));}catch{}log('DSH 已停止。');return {ok:true,notes:['DSH 已停止；其餘應用程式不受影響。']};}
async function startInner(port,log){const pid=await portOwner(port);if(pid){if(!isDsh(await processInfo(pid)))throw Error(`連接埠 ${port} 被其他程式使用（PID ${pid}），不會結束它。`);const url=await findUrl(port,pid);if(url){log('已連接現有 DSH，沒有重複啟動。');return {ok:true,already:true,url,pid};}log('現有 DSH 的登入網址已失效，正在重新建立服務。');await stopInner(port,log);}await ensurePatchedStart(log);const cli=cliPath();if(!fs.existsSync(cli))throw Error('尚未安裝 DSH，請先使用「安裝／檢查」功能。');for(const file of [outLog,errLog])if(fs.existsSync(file))fs.copyFileSync(file,file+'.previous');const out=fs.openSync(outLog,'w'),err=fs.openSync(errLog,'w');let child;try{child=spawn(process.execPath,[cli,'web','--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:os.homedir(),env:{...process.env,DSH_HOME:dshHome},detached:true,windowsHide:true,stdio:['ignore',out,err]});}finally{fs.closeSync(out);fs.closeSync(err);}let spawnError=null,exitCode=null;child.on('error',e=>{spawnError=e;});child.on('exit',c=>{exitCode=c;});child.unref();log('DSH 啟動中…');const t=Date.now();while(Date.now()-t<120000){await sleep(500);if(spawnError||exitCode!==null||!alive(child.pid)){let detail='';try{detail=redact(fs.readFileSync(errLog,'utf8').slice(-2000));}catch{}throw Error('DSH 啟動失敗。'+(detail?'\n'+detail:''));}const urls=parseUrls(fs.readFileSync(outLog,'utf8'),port);if(urls.length&&await validateUrl(urls[0],port)){writeJSON(path.join(shared,'service.json'),{pid:child.pid,port,url:urls[0]});log('DSH 已就緒。');return {ok:true,url:urls[0],pid:child.pid,startupMs:Date.now()-t};}}throw Error('DSH 啟動逾時，請查看錯誤日誌。');}
async function ensurePatchedStart(log){
 const target=path.join(dshHome,'profiles/web/node_modules/dsh-our-free-model');
 if(!fs.existsSync(path.join(target,'package.json')))return;
 const {inspectPatch}=await import('./patched-plugin/patch-assets/patch-health.mjs');
 const {applyLocalPatches,recoverInterruptedUpdate}=await import('./patched-plugin/patch-assets/update-safety.mjs');
 if(await recoverInterruptedUpdate(target,dshHome))log('已從驗證備份復原中斷的更新。');
 const assets=path.join(appDir,'patched-plugin/patch-assets'),external=path.join(dshHome,'our-free-model/patch-assets');
 fs.cpSync(assets,external,{recursive:true});
 const health=inspectPatch(target);
 if(!health.healthy||!health.updateGate||!health.reloadGate){
   applyLocalPatches(target,{home:dshHome});log('啟動前補丁檢查通過。');
 }
}
export function start(port=config().port,log=()=>{}){validPort(port);return withLock('action',async()=>{return startInner(port,log);});}
export function stop(port=config().port,log=()=>{}){validPort(port);return withLock('action',()=>stopInner(port,log));}
export function withServiceMaintenance(fn){return withLock('action',()=>fn({stop:stopInner,start:startInner}));}
export function restart(port=config().port,log=()=>{}){validPort(port);return withLock('action',async()=>{await stopInner(port,log);return startInner(port,log);});}
export async function openDsh(mode=config().mode,port=config().port){const s=await status(port);if(!s.ready)throw Error('DSH 尚未就緒，請先啟動。');return openUrl(s.url,mode,false);}
export async function reloadPlugin(log=()=>{}){return withLock('action',async()=>{
 const target=path.join(dshHome,'profiles/web/node_modules/dsh-our-free-model');
 const {assertReloadSafe}=await import('./patched-plugin/patch-assets/update-safety.mjs');
 assertReloadSafe(target);
 const s=await status();if(!s.ready)throw Error('DSH 尚未就緒，請先啟動。');
 const boot=await fetch(s.url,{redirect:'manual',signal:AbortSignal.timeout(4000)});await boot.body?.cancel();
 const cookie=boot.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 if(boot.status!==303||!cookie)throw Error('無法取得 DSH 登入狀態。');
 const request=async(route,method='GET')=>{
   const url=new URL('/api/our-free-model/'+route,s.url);
   const r=await fetch(url,{method,headers:{cookie,origin:url.origin,'content-type':'application/json'},body:method==='POST'?'{}':undefined,redirect:'error',signal:AbortSignal.timeout(4000)});
   const body=await r.json();if(!r.ok)throw Error(body.error||'外掛 HTTP '+r.status);return body;
 };
 const before=await request('meta');await request('reload','POST');log('正在重載 Our Free Model；DSH 服務保持執行。');
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){await sleep(500);try{const next=await request('meta');if(next.reloadCount>before.reloadCount||next.reloadedAt>before.reloadedAt){log('外掛重載完成。');return {ok:true,notes:['外掛重載已確認；DSH 服務沒有重新啟動。']};}}catch{}}
 throw Error('已送出重載，但尚未確認完成；請查看 DSH 日誌。');
});}
export async function openUrl(url,mode='app',launcher=false){const edge=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean).map(p=>path.join(p,'Microsoft/Edge/Application/msedge.exe')).find(fs.existsSync);let child;if(mode==='app'&&edge){child=spawn(edge,[`--app=${url}`,'--new-window',`--user-data-dir=${path.join(dshHome,launcher?'edge-launcher-profile':'edge-app-profile')}`],{detached:true,windowsHide:true,stdio:'ignore'});}else{const encoded=Buffer.from(`Start-Process -FilePath '${url.replace(/'/g,"''")}'`,'utf16le').toString('base64');child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{detached:true,windowsHide:true,stdio:'ignore'});}child.on('error',()=>{});child.unref();return {ok:true};}
