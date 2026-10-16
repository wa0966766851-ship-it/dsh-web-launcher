import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import * as m from './manager.mjs';
const args=process.argv.slice(2),action=args[0]||'ui';
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const port=m.validPort(Number(value('--port')||m.config().port));
const mode=value('--mode')||m.config().mode;
const log=s=>console.log(m.redact(s));
async function ui(){let current=m.readJSON(path.join(m.shared,'ui.json'));async function valid(s){if(!s||!m.alive(s.pid))return false;try{const u=new URL(s.url);if(u.hostname!=='127.0.0.1')return false;const r=await fetch(new URL('/api/ping?t='+u.searchParams.get('t'),u),{signal:AbortSignal.timeout(2500)});return r.status===200&&(await r.json()).name==='dsh-web-launcher';}catch{return false;}}if(!await valid(current)){const child=spawn(process.execPath,[path.join(m.appDir,'server.mjs')],{detached:true,windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();const deadline=Date.now()+30000;do{await new Promise(r=>setTimeout(r,400));current=m.readJSON(path.join(m.shared,'ui.json'));if(await valid(current))break;}while(Date.now()<deadline);if(!await valid(current))throw Error('啟動台無法啟動，請執行安裝／檢查。');}await m.openUrl(current.url,'app',true);log('已開啟 DSH 啟動台。');}
try{if(action==='ui'){await ui();}else if(action==='status'){const s=await m.status(port);if(args.includes('--json'))console.log(JSON.stringify(s));else if(s.ready)log('DSH 已就緒（認證頁面 HTTP 200）。');else throw Error(s.foreignPid?'連接埠由其他程式使用。':s.running?'DSH 正在執行，但登入網址不可用。':'DSH 尚未啟動。');}else if(action==='stop'){await m.stop(port,log);}else if(['start','restart'].includes(action)){m.setConfig({port,mode});await(action==='restart'?m.restart(port,log):m.start(port,log));if(!args.includes('--no-open'))await m.openDsh(mode,port);}else if(action==='open'){await m.openDsh(mode,port);}else throw Error('未知動作。');}catch(e){console.error(m.redact(e.message));process.exitCode=1;}
