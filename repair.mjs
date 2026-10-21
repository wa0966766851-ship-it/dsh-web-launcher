import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import * as m from './manager.mjs';
import {inspectPatch} from './patched-plugin/patch-assets/patch-health.mjs';
import {acquirePatchLock} from './patched-plugin/patch-assets/update-safety.mjs';

const target=path.join(m.dshHome,'profiles/web/node_modules/dsh-our-free-model');
const assets=path.join(m.appDir,'patched-plugin/patch-assets');
const log=message=>console.log(m.redact(message));
const run=args=>new Promise((resolve,reject)=>execFile(process.execPath,args,{windowsHide:true,timeout:120000,maxBuffer:2e6},(error,stdout,stderr)=>{
  if(stdout)log(stdout.trim()); if(error)reject(Error(m.redact(stderr||error.message)));else resolve();
}));
try{
  if(!fs.existsSync(path.join(target,'package.json')))throw Error('Our Free Model 尚未安裝，請使用「安裝／檢查」。');
  await m.withServiceMaintenance(async service=>{
  const before=await m.status();
  const release=acquirePatchLock(target);
  try{
  // Stop before editing multiple runtime assets; the file watcher must not
  // reload a mixture of old and new files. Never stop an in-flight upgrade.
  const upgrade=m.readJSON(path.join(m.dshHome,'our-free-model/upgrade-state.json'));
  if(['installing','activating','recovery-required'].includes(upgrade?.phase))throw Error('插件更新尚未完成，請先處理復原狀態。');
  await run([path.join(assets,'reapply-ofm-patches.mjs'),'--pkg',target,'--dry-run','--owned-lock']);
  if(before.running)await service.stop(before.port,log);
    const sharedAssets=path.join(m.dshHome,'our-free-model/patch-assets');
    if(path.resolve(sharedAssets)!==path.resolve(assets))fs.cpSync(assets,sharedAssets,{recursive:true});
    await run([path.join(assets,'reapply-ofm-patches.mjs'),'--pkg',target,'--owned-lock']);
    const health=inspectPatch(target);
    if(!health.healthy||!health.updateGate||!health.reloadGate)throw Error('補丁檢查未通過：'+(health.syntaxError||'缺少必要功能。'));
    log('插件語法與補丁檢查通過（'+health.version+'）。');
  }finally{release();}
  if(before.running&&!process.argv.includes('--skip-start')){
    await service.start(before.port,log);
    if(!process.argv.includes('--no-open'))await m.openDsh();
  }
  });
}catch(e){console.error(m.redact(e.message));process.exitCode=1;}
