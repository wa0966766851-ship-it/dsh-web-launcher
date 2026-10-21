import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('reuse and plugin reload retain the service PID; console stays while open then exits independently',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-lifecycle-')),app=path.join(home,'app'),pkg=path.join(home,'profiles/web/node_modules/dsh-our-free-model');
 fs.mkdirSync(app,{recursive:true});fs.mkdirSync(path.join(home,'launcher'),{recursive:true});fs.mkdirSync(path.join(pkg,'src'),{recursive:true});fs.mkdirSync(path.join(pkg,'vendor/channel-pack'),{recursive:true});
 for(const f of ['server.mjs','control.mjs','manager.mjs','package.json','dsh-launcher.html'])fs.copyFileSync(path.join(root,f),path.join(app,f));
 fs.cpSync(path.join(root,'patched-plugin/patch-assets'),path.join(app,'patched-plugin/patch-assets'),{recursive:true});
 for(const f of ['client.js','index.js','src/isolated-login.js'])fs.copyFileSync(path.join(root,'patched-plugin',f),path.join(pkg,f));
 fs.writeFileSync(path.join(pkg,'package.json'),'{"version":"2.5.7"}');fs.writeFileSync(path.join(pkg,'vendor/channel-pack/pack.js'),'// validation_url');
 const fake=path.join(home,'fake-dsh.mjs');
 fs.writeFileSync(fake,`import http from 'node:http';let count=0;const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.searchParams.get('token')==='fixture'){res.writeHead(303,{'set-cookie':'dsh=fixture; HttpOnly',location:'/'});return res.end();}if(req.headers.cookie!=='dsh=fixture'){res.writeHead(401);return res.end();}if(u.pathname==='/api/our-free-model/meta'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({reloadCount:count,reloadedAt:count}));}if(u.pathname==='/api/our-free-model/reload'&&req.method==='POST'){setTimeout(()=>count++,50);res.writeHead(202,{'content-type':'application/json'});return res.end('{"ok":true}');}res.end('<!doctype html><html>fixture</html>');});s.listen(0,'127.0.0.1',()=>console.log(s.address().port));`);
 const service=spawn(process.execPath,[fake],{windowsHide:true,stdio:['ignore','pipe','pipe']});let consoleProcess,events;
 try{
  const port=Number(await new Promise((resolve,reject)=>{service.stdout.once('data',d=>resolve(String(d).trim()));service.once('error',reject);}));
  fs.writeFileSync(path.join(app,'launcher.config.json'),JSON.stringify({port}));fs.writeFileSync(path.join(home,'launcher/service.json'),JSON.stringify({pid:service.pid,port,url:`http://127.0.0.1:${port}/?token=fixture`}));
  consoleProcess=spawn(process.execPath,[path.join(app,'server.mjs')],{windowsHide:true,stdio:'ignore',env:{...process.env,DSH_HOME:home,DSH_LAUNCHER_CLI:fake,DSH_LAUNCHER_IDLE_MS:'1000'}});
  let ui;for(let n=0;n<80;n++){try{ui=JSON.parse(fs.readFileSync(path.join(home,'launcher/ui.json')));break;}catch{await sleep(100);}}
  assert.ok(ui);const base=new URL(ui.url),token=base.searchParams.get('t');
  const api=async(route,body)=>{const response=await fetch(new URL(route+'?t='+token,base),{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json()};};
  // An open console keeps only its own optional server alive.
  events=new AbortController();const stream=await fetch(new URL('/api/events?t='+token,base),{signal:events.signal});const reader=stream.body.getReader();await reader.read();
  const reused=await api('/api/start',{open:false,port});assert.equal(reused.body.result.already,true);assert.equal(reused.body.result.pid,service.pid);
  const reloaded=await api('/api/patch/reload',{});assert.equal(reloaded.status,200,JSON.stringify(reloaded.body));assert.equal(reloaded.body.result.ok,true);
  assert.equal((await api('/api/state')).body.state.pid,service.pid);
  await sleep(1300);assert.equal((await api('/api/ping')).status,200);
  events.abort();await reader.cancel().catch(()=>{});
  for(let n=0;n<50&&consoleProcess.exitCode===null;n++)await sleep(100);
  assert.equal(consoleProcess.exitCode,0,'console should exit after its last page closes');
  assert.equal(service.exitCode,null,'DSH should remain alive');
  assert.equal((await fetch(`http://127.0.0.1:${port}/?token=fixture`,{redirect:'manual'})).status,303);
 }finally{
  events?.abort();for(const child of [consoleProcess,service])if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
  fs.rmSync(home,{recursive:true,force:true});
 }
});

test('existing-install PowerShell flow preserves a newer plugin and does not install or start services',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-existing-install-')),app=path.join(home,'app'),profile=path.join(home,'profiles/web'),pkg=path.join(profile,'node_modules/dsh-our-free-model');
 try{
  fs.mkdirSync(app,{recursive:true});fs.mkdirSync(path.join(pkg,'src'),{recursive:true});fs.mkdirSync(path.join(pkg,'vendor/channel-pack'),{recursive:true});
  for(const f of ['install.ps1','repair.mjs','manager.mjs','control.mjs','package.json','dsh-launcher.html'])fs.copyFileSync(path.join(root,f),path.join(app,f));
  fs.cpSync(path.join(root,'patched-plugin/patch-assets'),path.join(app,'patched-plugin/patch-assets'),{recursive:true});
  for(const f of ['client.js','index.js','src/isolated-login.js'])fs.copyFileSync(path.join(root,'patched-plugin',f),path.join(pkg,f));
  fs.writeFileSync(path.join(pkg,'package.json'),'{"version":"2.5.8","type":"module"}');fs.writeFileSync(path.join(pkg,'vendor/channel-pack/pack.js'),'// item.reason === "VALIDATION_REQUIRED"\n// const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(\nexport const validation_url = true;\n');
  for(const name of ['dsh-orb','gal-view']){fs.mkdirSync(path.join(profile,'node_modules',name),{recursive:true});fs.writeFileSync(path.join(profile,'node_modules',name,'package.json'),'{}');}
  const configuration={dependencies:{'dsh-our-free-model':'^2.5.8'},dsh:{profile:{bundles:['dsh-orb','gal-view','dsh-our-free-model']}}};
  const profileFile=path.join(profile,'package.json');fs.writeFileSync(profileFile,JSON.stringify(configuration));const before=fs.readFileSync(profileFile);
  const prefix=path.join(home,'prefix'),cli=path.join(prefix,'node_modules/@deepseek-ai/dsh/lib/bin.js');fs.mkdirSync(path.dirname(cli),{recursive:true});
  fs.writeFileSync(cli,"if(process.argv[2]==='--version')console.log('fixture DSH');else{console.error('unexpected installer/start command');process.exit(99);}");
  fs.writeFileSync(path.join(app,'launcher.config.json'),JSON.stringify({port:59432,cliPath:cli,theme:'dark'}));
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(app,'install.ps1'),'-InstallPrefix',prefix,'-SkipStart','-NoOpen','-SkipShortcuts'],{env:{...process.env,DSH_HOME:home},windowsHide:true,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/Newer installed plugin preserved: 2.5.8/);
  assert.deepEqual(fs.readFileSync(profileFile),before);assert.equal(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'))).version,'2.5.8');
  assert.equal(fs.existsSync(path.join(home,'launcher/service.json')),false);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
