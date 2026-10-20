import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import http from 'node:http';
import {inspectPatch} from '../patched-plugin/patch-assets/patch-health.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-patch-tests-'));
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
function fixture(name){
 const dir=path.join(temp,name);fs.mkdirSync(path.join(dir,'src'),{recursive:true});fs.mkdirSync(path.join(dir,'vendor/channel-pack'),{recursive:true});
 for(const file of ['client.js','index.js'])fs.copyFileSync(path.join(repo,'patched-plugin',file),path.join(dir,file));
 fs.copyFileSync(path.join(repo,'patched-plugin/patch-assets/isolated-login.js'),path.join(dir,'src/isolated-login.js'));
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'dsh-our-free-model',version:'2.5.7',type:'module'}));
 fs.writeFileSync(path.join(dir,'vendor/channel-pack/pack.js'),'// item.reason === "VALIDATION_REQUIRED"\n// const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(\nexport const validation_url = true;\n');
 return dir;
}
const run=dir=>spawnSync(process.execPath,[path.join(repo,'patched-plugin/patch-assets/reapply-ofm-patches.mjs'),'--pkg',dir,'--backup-dir',path.join(dir,'backups'),'--quiet'],{encoding:'utf8',windowsHide:true});
test('health check rejects syntactically invalid clients even when every patch marker is present',()=>{
 const dir=fixture('health');assert.equal(inspectPatch(dir).healthy,true);
 fs.appendFileSync(path.join(dir,'client.js'),'\nconst broken = ;');const s=inspectPatch(dir);
 assert.equal(s.verify,true);assert.equal(s.banner,true);assert.equal(s.syntax,false);assert.equal(s.healthy,false);
});
test('historical locale and page corruption is repaired with a backup and repeated runs make no changes',()=>{
 const dir=fixture('repair'),file=path.join(dir,'client.js');
 const correct=fs.readFileSync(file,'utf8');
 const broken=correct.replace("'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',\n","'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',```n").replace("t('patch.note')))))","t('patch.note'))))");
 assert.notEqual(broken,correct);fs.writeFileSync(file,broken);
 const cache=path.join(dir,'shared-store-client.js');fs.copyFileSync(file,cache);fs.unlinkSync(file);fs.linkSync(cache,file);
 const result=run(dir);assert.equal(result.status,0,result.stderr);assert.equal(inspectPatch(dir).healthy,true);
 const repaired=fs.readFileSync(file,'utf8');assert.equal(repaired,correct);
 assert.equal(fs.readFileSync(cache,'utf8'),broken,'repair must not modify a pnpm hard-link target');
 const backups=fs.readdirSync(path.join(dir,'backups'));assert.equal(backups.length,1);
 assert.equal(fs.readFileSync(path.join(dir,'backups',backups[0],'client.js'),'utf8'),broken);
 assert.equal(run(dir).status,0);assert.deepEqual(fs.readdirSync(path.join(dir,'backups')),backups);assert.equal(fs.readFileSync(file,'utf8'),repaired);
});
test('unknown syntax errors leave all plugin files untouched',()=>{
 const dir=fixture('syntax');fs.appendFileSync(path.join(dir,'client.js'),'\nconst unknown = ;');
 const files=['client.js','index.js','vendor/channel-pack/pack.js','src/isolated-login.js'];
 const before=files.map(f=>fs.readFileSync(path.join(dir,f)));
 const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/nothing written/);
 files.forEach((f,i)=>assert.deepEqual(fs.readFileSync(path.join(dir,f)),before[i]));assert.equal(fs.existsSync(path.join(dir,'backups')),false);
});
test('changed upstream banner anchors are refused before writing a partial patch',()=>{
 const dir=fixture('anchors'),file=path.join(dir,'client.js');
 const changed=fs.readFileSync(file,'utf8').replace('hideAds() ? null : h(SponsorBanner','h(SponsorBanner');fs.writeFileSync(file,changed);
 const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/ANCHOR PROBLEMS/);assert.equal(fs.readFileSync(file,'utf8'),changed);
});

test('console reports bad syntax and repairs asynchronously with authenticated, serialized operations',async()=>{
 const root=path.join(temp,'console'),app=path.join(root,'app'),home=path.join(root,'home');fs.mkdirSync(app,{recursive:true});
 const packageDir=fixture('api-plugin');fs.appendFileSync(path.join(packageDir,'client.js'),'\n');
 const clientPath=path.join(packageDir,'client.js');fs.writeFileSync(clientPath,fs.readFileSync(clientPath,'utf8').replace("'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',\n","'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',```n"));
 fs.mkdirSync(path.join(home,'profiles/web/node_modules'),{recursive:true});fs.cpSync(packageDir,path.join(home,'profiles/web/node_modules/dsh-our-free-model'),{recursive:true});
 for(const file of ['server.mjs','manager.mjs','control.mjs','repair.mjs','repair.ps1','package.json','dsh-launcher.html'])fs.copyFileSync(path.join(repo,file),path.join(app,file));
 fs.cpSync(path.join(repo,'patched-plugin/patch-assets'),path.join(app,'patched-plugin/patch-assets'),{recursive:true});
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 fs.writeFileSync(path.join(app,'launcher.config.json'),JSON.stringify({port}));
 const child=spawn(process.execPath,[path.join(app,'server.mjs')],{env:{...process.env,DSH_HOME:home},windowsHide:true,stdio:'ignore'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ui;
 try{
  for(let i=0;i<100;i++){try{ui=JSON.parse(fs.readFileSync(path.join(home,'launcher/ui.json'),'utf8'));break;}catch{await sleep(100);}}
  assert.ok(ui,'console did not start');const base=new URL(ui.url),token=base.searchParams.get('t');
  const api=async(route,method='GET',body)=>{const response=await fetch(new URL(route+'?t='+token,base),{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json()};};
  const bad=await api('/api/patch/status');assert.equal(bad.body.patch.syntax,false);assert.equal(bad.body.patch.healthy,false);
  assert.equal((await fetch(new URL('/api/patch/status',base))).status,401);
  assert.equal((await fetch(new URL('/api/patch/status?t='+token,base),{headers:{origin:'https://example.com'}})).status,403);
  const repair=await api('/api/patch/reapply','POST',{});assert.equal(repair.status,202);assert.equal(repair.body.started,true);
  const duplicate=await api('/api/patch/reapply','POST',{});assert.notEqual(duplicate.status,202);
  const ping=await fetch(new URL('/api/ping?t='+token,base),{signal:AbortSignal.timeout(2000)});assert.equal(ping.status,200);
  let state;
  for(let i=0;i<80;i++){state=(await api('/api/state')).body.state;if(!state.setup.running)break;await sleep(200);}
  assert.equal(state.setup.running,false);assert.equal(state.setup.error,null);
  const good=await api('/api/patch/status');assert.equal(good.body.patch.healthy,true);assert.equal(good.body.patch.autoexpand,true);
  assert.equal((await api('/api/patch/guard','POST',{action:'unsupported'})).status,400);
 }finally{if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
});
