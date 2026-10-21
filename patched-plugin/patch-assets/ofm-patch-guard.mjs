/**
 * Explicit patch inspection and legacy task removal. This script does not run
 * periodically or install a task. Normal protection lives in update-safety.mjs
 * and the launcher start path. A live DSH package is never changed by this tool.
 * --status reads health; --remove removes this project's old scheduled task;
 * --install is retained only to explain that scheduled guarding was retired.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectPatch } from './patch-health.mjs';
import { checkUpdates } from './update-monitor.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argument = name => {const n=argv.indexOf(name);return n>=0?argv[n+1]:undefined;};
const dshRoot = argument('--home') || process.env.DSH_HOME || path.join(process.env.USERPROFILE ?? '', '.dsh');
const PATCH = path.join(HERE, 'reapply-ofm-patches.mjs');
const PKG = (() => {
  if(argument('--pkg'))return path.resolve(argument('--pkg'));
  if (process.env.OFM_PATCH_TARGET && fs.existsSync(process.env.OFM_PATCH_TARGET)) return process.env.OFM_PATCH_TARGET;
  const home = process.env.USERPROFILE ?? '';
  const dshHome = dshRoot;
  const candidates = [
    path.join(dshHome, 'profiles', 'web', 'node_modules', 'dsh-our-free-model'),
    path.join(home, 'dsh-our-free-model'),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, 'client.js'))) ?? candidates[0];
})();
const DATA = path.join(dshRoot, 'our-free-model');
fs.mkdirSync(DATA,{recursive:true});
const LOG = path.join(DATA, 'patch-guard.log');
const STATE = path.join(DATA, 'patch-guard-state.json');
const LOCK = path.join(DATA, 'patch-guard.lock');
const TASK = 'OFM-PatchGuard';

const has = (f) => argv.includes(f);

function stamp() { return new Date().toISOString(); }
function note(line) {
  const text = `[${stamp()}] ${line}\n`;
  try { fs.appendFileSync(LOG, text); } catch {}
  if (!has('--quiet')) process.stdout.write(text);
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

// ── status ───────────────────────────────────────────────────────────────────
function snapshot() { return inspectPatch(PKG); }
function healthy(s) {
  return s.healthy === true;
}

if (has('--status')) {
  const s = snapshot();
  console.log(JSON.stringify({ ...s, healthy: healthy(s), state: readJson(STATE, null) }, null, 2));
  process.exit(healthy(s) ? 0 : 1);
}

// ── install / remove the scheduled task ──────────────────────────────────────
if (has('--install') || has('--remove')) {
  if (has('--remove')) {
    const query=spawnSync('schtasks', ['/Query','/TN',TASK,'/XML'],{encoding:'utf8',windowsHide:true});
    if(query.status!==0){console.log('No legacy guard task found.');process.exit(0);}
    if(!query.stdout.toLowerCase().includes('ofm-patch-guard.mjs')){console.error('The task name belongs to another command; it was preserved.');process.exit(1);}
    const r = spawnSync('schtasks', ['/Delete', '/TN', TASK, '/F'], { encoding: 'utf8',windowsHide:true });
    console.log(r.status === 0 ? 'scheduled task removed' : `remove failed: ${r.stderr || r.stdout}`);
    process.exit(r.status === 0 ? 0 : 1);
  }
  console.error('Periodic guard installation has been retired. Protection runs on update activation and launcher start; no resident guard is required.');
  process.exit(1);

}

// ── one check ────────────────────────────────────────────────────────────────
if (!fs.existsSync(PATCH)) { note('FATAL: patch script missing at ' + PATCH); process.exit(2) }
if (!fs.existsSync(PKG)) { note('FATAL: plugin directory missing at ' + PKG); process.exit(2) }

// Never fight an upgrade that is mid-flight.
const upState = readJson(path.join(DATA, 'upgrade-state.json'), null);
if (upState && ['installing', 'activating', 'recovery-required'].includes(upState.phase)) {
  note(`upgrade in progress (${upState.phase}); skipping`);
  process.exit(0);
}

// One run per minute: a lock older than 60s is treated as stale.
try {
  const age = Date.now() - fs.statSync(LOCK).mtimeMs;
  if (age < 60_000) process.exit(0);
} catch { /* no lock yet */ }
try { fs.writeFileSync(LOCK, String(Date.now())) } catch {}

const before = snapshot();
await checkUpdates(dshRoot,{installed:{'Our Free Model':before.version}}).catch(e=>note('update check: '+e.message));
if (healthy(before) && before.updateGate) {
  process.exit(0);
}
// The live updater uses the activation gate. Do not race a live file watcher
// after an update performed outside that gate; repair at a deliberate restart.
const service=readJson(path.join(dshRoot,'launcher/service.json'),null);
if(service?.pid){let running=false;try{process.kill(service.pid,0);running=true;}catch{}
  if(running){note('repair pending: DSH is running; use Repair or restart through the launcher.');process.exit(0);}}

note(`patches missing on ${before.version || '?'} — reapplying (verify=${before.verify} isolated=${before.isolated} route=${before.route} parse=${before.parse} ads=${before.ads} page=${before.page})`);

const run = spawnSync(process.execPath, [PATCH, '--pkg', PKG, '--quiet'], { encoding: 'utf8', windowsHide:true, env:{...process.env,DSH_HOME:dshRoot} });
const after = snapshot();
const ok = healthy(after);

const state = {
  at: Date.now(),
  versionBefore: before.version,
  versionAfter: after.version,
  before,
  after,
  applied: run.status === 0,
  healthy: ok,
  stdout: (run.stdout ?? '').slice(-4000),
  stderr: (run.stderr ?? '').slice(-4000),
};
try { fs.writeFileSync(STATE, JSON.stringify(state, null, 2)) } catch {}

if (ok) {
  note(`patches reapplied on ${after.version}`);
  // autoReloadWatch is usually on, so the plugin reloads itself. If it is off,
  // say so rather than pretending the running process picked this up.
  const settings = readJson(path.join(DATA, 'settings.json'), {});
  if (settings.autoReloadWatch !== true) {
    note('note: autoReloadWatch is off — open Settings → Our Free Model → 插件升级 and press 热重载插件');
  }
  process.exit(0);
}

note('reapply FAILED — anchors no longer match upstream. Details in patch-guard-state.json');
process.exit(1);
