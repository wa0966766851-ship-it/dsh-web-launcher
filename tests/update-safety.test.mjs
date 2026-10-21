import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PluginUpdater,signManifest,backupPackage} from '../patched-plugin/src/updater.js';
import {acquirePatchLock,guardedApply,recoverInterruptedUpdate,assertReloadSafe} from '../patched-plugin/patch-assets/update-safety.mjs';
import {inspectPatch} from '../patched-plugin/patch-assets/patch-health.mjs';
import {compareVersions,inspectProject,checkUpdates,projects} from '../patched-plugin/patch-assets/update-monitor.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-update-tests-'));
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const keys=crypto.generateKeyPairSync('ed25519');
const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
function fixture(name){
 const home=path.join(temp,name),pkg=path.join(home,'pkg'),dataDir=path.join(home,'our-free-model');
 fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(dataDir,{recursive:true});
 for(const f of ['client.js','index.js','src/updater.js','src/isolated-login.js']){fs.mkdirSync(path.dirname(path.join(pkg,f)),{recursive:true});fs.copyFileSync(path.join(root,'patched-plugin',f),path.join(pkg,f));}
 fs.mkdirSync(path.join(pkg,'vendor/channel-pack'),{recursive:true});
 fs.writeFileSync(path.join(pkg,'vendor/channel-pack/pack.js'),'// item.reason === "VALIDATION_REQUIRED"\n// const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(\nexport const validation_url = true;\n');
 fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'dsh-our-free-model',type:'module',version:'2.5.7'}));
 const run=spawnSync(process.execPath,[path.join(root,'patched-plugin/patch-assets/reapply-ofm-patches.mjs'),'--pkg',pkg,'--quiet'],{encoding:'utf8',env:{...process.env,DSH_HOME:home},windowsHide:true});
 assert.equal(run.status,0,run.stderr);
 return {pkg,home,dataDir};
}
function filesIn(pkg){const rows=[];for(const entry of fs.readdirSync(pkg,{withFileTypes:true})){if(entry.isDirectory())for(const [f,b] of filesIn(path.join(pkg,entry.name)))rows.push([entry.name+'/'+f,b]);else rows.push([entry.name,fs.readFileSync(path.join(pkg,entry.name))]);}return rows;}
async function releaseServer(pkg,{badAnchor=false,badSignature=false}={}){
 const files=new Map(filesIn(pkg).filter(([f])=>f!=='src/isolated-login.js'));
 files.set('package.json',Buffer.from(JSON.stringify({name:'dsh-our-free-model',type:'module',version:'2.5.8'})));
 let index=files.get('index.js').toString().replace(/      const localUpdateSafety = await import[^\n]*\n      const result = await localUpdateSafety.guardedApply\(updater, \{/,'      const result = await updater.apply({');
 index=index.replace(/    const localReloadSafety = await import[^\n]*\n    localReloadSafety.assertReloadSafe\(PKG_DIR\)\n/,'');files.set('index.js',Buffer.from(index));
 if(badAnchor)files.set('client.js',Buffer.from(files.get('client.js').toString().replaceAll('hideAds() ? null : h(SponsorBanner','h(ChangedSponsorBanner')));
 const manifest={version:'2.5.8',notes:'',publishedAt:0,base:'../',files:[...files].map(([path,body])=>({path,size:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')}))};
 manifest.signature=signManifest(manifest,keys.privateKey);if(badSignature)manifest.signature='invalid';
 const server=http.createServer((req,res)=>{const route=new URL(req.url,'http://local').pathname.slice(1);if(route==='feed/manifest.json')return res.end(JSON.stringify(manifest));if(files.has(route))return res.end(files.get(route));res.writeHead(404);res.end();});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}/feed/manifest.json`,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function transaction(name,options,callback){const f=fixture(name),server=await releaseServer(f.pkg,options);const updater=new PluginUpdater({pkgDir:f.pkg,dataDir:f.dataDir,settings:()=>({}),defaultSources:[server.url],manifestPublicKey:publicKey});try{await callback(f,updater);}finally{await server.close();}}

test('signed upstream update patches before activation and preserves both gates for the next update',async()=>{
 await transaction('success',{},async(f,updater)=>{
  let activated=0;
  const result=await guardedApply(updater,{activate:async installed=>{activated++;const health=inspectPatch(f.pkg);assert.equal(health.healthy,true);assert.equal(health.updateGate,true);assert.equal(health.reloadGate,true);return {ok:true,version:installed.version};}});
  assert.equal(result.version,'2.5.8');assert.equal(activated,1);assert.equal(updater.loadUpgradeState().phase,'complete');assertReloadSafe(f.pkg);
  assert.equal(fs.existsSync(path.join(f.dataDir,'patch-assets/upstream-recovery.mjs')),true);
 });
});
test('incompatible signed release rolls every package file back before any activation',async()=>{
 await transaction('incompatible',{badAnchor:true},async(f,updater)=>{
  const before=filesIn(f.pkg);let activated=false;
  await assert.rejects(guardedApply(updater,{activate:async()=>{activated=true;return {ok:true};}}),/previous files restored/);
  assert.equal(activated,false);assert.deepEqual(filesIn(f.pkg),before);assert.equal(updater.loadUpgradeState().phase,'rolled-back');
 });
});
test('invalid release signature never reaches installed files or activation',async()=>{
 await transaction('signature',{badSignature:true},async(f,updater)=>{const before=filesIn(f.pkg);await assert.rejects(guardedApply(updater,{activate:async()=>assert.fail('must not activate')}),/signature/);assert.deepEqual(filesIn(f.pkg),before);});
});
test('failed runtime activation restores disk and retains the upstream recovery-required state',async()=>{
 await transaction('activation',{},async(f,updater)=>{const before=filesIn(f.pkg);await assert.rejects(guardedApply(updater,{activate:async()=>({ok:false,restored:false,error:'runtime failure'})}),/previous files restored/);assert.deepEqual(filesIn(f.pkg),before);assert.equal(updater.loadUpgradeState().phase,'recovery-required');});
});
test('interrupted install restores a verified backup; corrupt backup is refused without wiping installed files',async()=>{
 for(const corrupt of [false,true]){
  const f=fixture('recover-'+corrupt);const before=filesIn(f.pkg);backupPackage(f.pkg,path.join(f.dataDir,'rollback'));
  fs.mkdirSync(path.join(f.dataDir,'patch-assets'),{recursive:true});fs.copyFileSync(path.join(f.pkg,'src/updater.js'),path.join(f.dataDir,'patch-assets/upstream-recovery.mjs'));
  fs.writeFileSync(path.join(f.dataDir,'upgrade-state.json'),JSON.stringify({phase:'installing',from:'2.5.7',to:'2.5.8'}));
  fs.writeFileSync(path.join(f.pkg,'index.js'),'// interrupted update');
  if(corrupt){fs.writeFileSync(path.join(f.dataDir,'rollback/index.js'),'corrupt');const broken=filesIn(f.pkg);await assert.rejects(recoverInterruptedUpdate(f.pkg,f.home),/backup|snapshot|hash/i);assert.deepEqual(filesIn(f.pkg),broken);}
  else{assert.equal(await recoverInterruptedUpdate(f.pkg,f.home),true);assert.deepEqual(filesIn(f.pkg),before);assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir,'upgrade-state.json'))).phase,'rolled-back');}
 }
});
test('recovery helper is never overwritten by another update while recovery is pending',async()=>{
 const f=fixture('pending');const helper=path.join(f.dataDir,'patch-assets/upstream-recovery.mjs');fs.mkdirSync(path.dirname(helper));fs.writeFileSync(helper,'// original helper');fs.writeFileSync(path.join(f.dataDir,'upgrade-state.json'),JSON.stringify({phase:'activating'}));
 await assert.rejects(guardedApply({deps:{pkgDir:f.pkg,dataDir:f.dataDir},apply:()=>assert.fail('pending recovery')},{}),/復原/);assert.equal(fs.readFileSync(helper,'utf8'),'// original helper');
});
test('exclusive patch lock blocks concurrent reloads and recovers dead or abandoned owners',()=>{
 const f=fixture('locks'),lock=fs.realpathSync(f.pkg)+'.local-patch.lock';const release=acquirePatchLock(f.pkg);assert.throws(()=>acquirePatchLock(f.pkg),/正在進行/);assert.throws(()=>assertReloadSafe(f.pkg),/正在進行/);release();
 fs.writeFileSync(lock,JSON.stringify({pid:2147483647}));acquirePatchLock(f.pkg)();fs.writeFileSync(lock,'');assert.throws(()=>acquirePatchLock(f.pkg),/尚未就緒/);fs.utimesSync(lock,new Date(0),new Date(0));acquirePatchLock(f.pkg)();assert.equal(fs.existsSync(lock),false);
});
test('semantic versions preserve newer installs including prerelease ordering',()=>{
 assert.equal(compareVersions('2.6.0','2.5.7'),1);assert.equal(compareVersions('0.2.0-rc.10','0.2.0-rc.2'),1);assert.equal(compareVersions('0.2.0','0.2.0-rc.2'),1);assert.equal(compareVersions('2.5.7','2.5.7'),0);assert.throws(()=>compareVersions('unknown','2.5.7'));
});
test('repository transfer is detected by immutable ID without trusting or downloading its new code',async()=>{
 const project=projects[0],calls=[];const result=await inspectProject(project,{fetchImpl:async url=>{calls.push(url);return Response.json({id:project.id,full_name:'another-owner/new-name',archived:false});}});assert.equal(result.status,'moved');assert.equal(calls.length,1);
 await assert.rejects(inspectProject(project,{fetchImpl:async()=>Response.json({id:0})}),/識別碼/);
});
test('offline update checks keep installed files and cached results describe the current installed version',async()=>{
 const f=fixture('offline'),before=filesIn(f.pkg);const result=await checkUpdates(f.home,{force:true,fetchImpl:async()=>{throw Error('offline');}});assert.equal(result.automaticInstall,false);assert.equal(result.projects.every(p=>p.status==='unavailable'),true);assert.deepEqual(filesIn(f.pkg),before);
 const online=async url=>{const p=projects.find(p=>url.endsWith('/'+p.id)||url.includes(p.repo));return Response.json(url.includes('/repositories/')?{id:p.id,full_name:p.repo}:{content:Buffer.from(JSON.stringify({version:'2.5.8'})).toString('base64')});};
 await checkUpdates(f.home,{force:true,fetchImpl:online,installed:{'Our Free Model':'2.5.7'}});
 const cached=await checkUpdates(f.home,{installed:{'Our Free Model':'2.5.8'},fetchImpl:()=>assert.fail('cache should not fetch')});assert.equal(cached.projects[0].status,'current');assert.equal(cached.projects[0].installed,'2.5.8');
});
test('API rate limiting falls back to a repository page only after verifying its stable identity',async()=>{
 const p=projects[0],calls=[];
 const fallback=async url=>{calls.push(url);if(url.includes('api.github.com'))return new Response('',{status:403});if(url.includes('raw.githubusercontent.com'))return Response.json({version:'2.5.8'});return new Response(`<meta name="octolytics-dimension-repository_id" content="${p.id}"><meta name="octolytics-dimension-repository_nwo" content="${p.repo}"><script>{"defaultBranch":"main"}</script>`);};
 const result=await inspectProject(p,{installed:'2.5.7',fetchImpl:fallback});assert.equal(result.source,'github-page');assert.equal(result.status,'available');assert.equal(calls.length,3);
 await assert.rejects(inspectProject(p,{fetchImpl:async url=>url.includes('api.github.com')?new Response('',{status:403}):new Response('<meta name="octolytics-dimension-repository_id" content="999">')}),/識別碼/);
});
