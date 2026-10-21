// Lives outside the upstream package: release cleanup cannot delete this gate.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {inspectPatch} from './patch-health.mjs';

export function acquirePatchLock(pkg) {
  const lock=fs.realpathSync(pkg)+'.local-patch.lock';
  for(let attempt=0;attempt<2;attempt++){
    try {const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);return ()=>{try{fs.unlinkSync(lock);}catch{}};}
    catch(error){if(error.code!=='EEXIST')throw error;
      let owner;try{owner=JSON.parse(fs.readFileSync(lock,'utf8'));if(!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error('invalid pid');}catch{
        if(Date.now()-fs.statSync(lock).mtimeMs<10000)throw Error('補丁鎖尚未就緒，請稍後重試。');
        fs.unlinkSync(lock);continue;
      }
      let alive=true;try{process.kill(owner.pid,0);}catch(e){alive=e.code!=='ESRCH';}
      if(alive)throw Error('插件更新或補丁作業正在進行，請稍後再試。');
      fs.unlinkSync(lock);
    }
  }
  throw Error('無法取得插件更新鎖。');
}

export function applyLocalPatches(pkg,{home,ownedLock=false}={}) {
  const assets=path.dirname(fileURLToPath(import.meta.url));
  const result=spawnSync(process.execPath,[path.join(assets,'reapply-ofm-patches.mjs'),'--pkg',pkg,'--quiet',...(ownedLock?['--owned-lock']:[])],{
    encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,...(home?{DSH_HOME:home}:{})},maxBuffer:2e6,
  });
  if(result.status!==0)throw Error('更新尚未啟用：補丁不相容或檢查失敗。'+String(result.stderr||result.error?.message||'').slice(-2000));
  const health=inspectPatch(pkg);
  if(!health.healthy||!health.updateGate||!health.reloadGate)throw Error('更新尚未啟用：補丁完整性檢查失敗。');
  return health;
}

export async function guardedApply(updater,options) {
  const pkg=updater.deps.pkgDir;
  const release=acquirePatchLock(pkg);
  try {
    const stateFile=path.join(updater.deps.dataDir,'upgrade-state.json');
    if(fs.existsSync(stateFile)){
      const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
      if(['installing','activating','recovery-required'].includes(state.phase))throw Error('上次更新需要復原；已保留原復原模組。');
    }
    const savedRecovery=path.join(updater.deps.dataDir,'patch-assets/upstream-recovery.mjs');
    fs.mkdirSync(path.dirname(savedRecovery),{recursive:true});
    const temporary=savedRecovery+'.'+process.pid+'.tmp';
    fs.copyFileSync(path.join(pkg,'src/updater.js'),temporary);fs.renameSync(temporary,savedRecovery);
    // Upstream still verifies its pinned signature and installed hashes FIRST.
    // A patch failure before reload lets its own transaction restore old files.
    return await updater.apply({...options,activate:async installed=>{
      try{applyLocalPatches(pkg,{home:path.dirname(updater.deps.dataDir),ownedLock:true});}
      catch(error){error.runtimeRestored=true;throw error;}
      return options.activate(installed);
    }});
  } finally {release();}
}

export function assertReloadSafe(pkg){
  const release=acquirePatchLock(pkg);
  try{
    const health=inspectPatch(pkg);
    if(!health.healthy||!health.updateGate||!health.reloadGate)throw Error('補丁不完整；請從啟動台修復後再重載。');
  }finally{release();}
}

export async function recoverInterruptedUpdate(pkg,home){
  const dir=path.join(home,'our-free-model'),file=path.join(dir,'upgrade-state.json');
  if(!fs.existsSync(file))return false;
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!['installing','activating','recovery-required'].includes(state.phase))return false;
  const release=acquirePatchLock(pkg);
  try{
    const helper=path.join(dir,'patch-assets/upstream-recovery.mjs');
    if(!fs.existsSync(helper))throw Error('需要復原，但找不到更新前保存的復原模組；已停止啟動並保留備份。');
    const {restoreBackup}=await import(pathToFileURL(helper).href);
    restoreBackup(path.join(dir,'rollback'),pkg);
    const version=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version;
    if(version!==state.from)throw Error('復原版本不符；已停止啟動。');
    const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...state,phase:'rolled-back',diskRestored:true,runtimeRestored:false,recoveredBeforeStart:true,error:''}));fs.renameSync(tmp,file);
    return true;
  }finally{release();}
}
