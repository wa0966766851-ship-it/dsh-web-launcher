import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import * as m from './manager.mjs';
import {inspectPatch} from './patched-plugin/patch-assets/patch-health.mjs';

const target=path.join(m.dshHome,'profiles/web/node_modules/dsh-our-free-model');
const assets=path.join(m.appDir,'patched-plugin/patch-assets');
const log=message=>console.log(m.redact(message));
const run=args=>new Promise((resolve,reject)=>execFile(process.execPath,args,{windowsHide:true,timeout:120000,maxBuffer:2e6},(error,stdout,stderr)=>{
  if(stdout)log(stdout.trim()); if(error)reject(Error(m.redact(stderr||error.message)));else resolve();
}));
try{
  if(!fs.existsSync(path.join(target,'package.json')))throw Error('Our Free Model 尚未安裝，請使用「安裝／檢查」。');
  const before=await m.status();
  await m.withLock('action',async()=>{
    await run([path.join(assets,'reapply-ofm-patches.mjs'),'--pkg',target]);
    const health=inspectPatch(target);
    if(!health.healthy)throw Error('補丁檢查未通過：'+(health.syntaxError||'缺少必要功能。'));
    // Keep the already registered scheduler path current; no new task is created.
    const sharedAssets=path.join(m.dshHome,'our-free-model/patch-assets');
    if(path.resolve(sharedAssets)!==path.resolve(assets))fs.cpSync(assets,sharedAssets,{recursive:true});
    log('插件語法與補丁檢查通過（'+health.version+'）。');
  });
  if(before.running&&!process.argv.includes('--skip-start')){
    await m.restart(before.port,log);
    if(!process.argv.includes('--no-open'))await m.openDsh();
  }
}catch(e){console.error(m.redact(e.message));process.exitCode=1;}
