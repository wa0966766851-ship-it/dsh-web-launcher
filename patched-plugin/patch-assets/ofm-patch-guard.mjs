/**
 * ofm-patch-guard.mjs — keep the local patches applied across upstream upgrades.
 *
 * Why: the in-app upgrader (src/updater.js installStaged) overwrites every file
 * in the release manifest and DELETES files the new release dropped. Any local
 * patch therefore disappears on every upgrade. This guard notices that and
 * re-applies, without the user remembering to run anything.
 *
 * It is deliberately conservative:
 *   - one run per minute at most (a lock file), so a loop cannot spin
 *   - writes only when an anchor is missing, and the patch script itself refuses
 *     to write anything if any anchor fails to match
 *   - a failed run leaves a marker and does NOT retry in a tight loop
 *   - never touches the plugin while an upgrade is in flight
 *
 * Run modes:
 *   node ofm-patch-guard.mjs            # one check (what the scheduler runs)
 *   node ofm-patch-guard.mjs --install  # register the Windows scheduled task
 *   node ofm-patch-guard.mjs --remove   # unregister it
 *   node ofm-patch-guard.mjs --status   # show state, change nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PATCH = path.join(HERE, 'reapply-ofm-patches.mjs');
const PKG = path.join(process.env.USERPROFILE ?? '', 'dsh-our-free-model');
const DATA = path.join(process.env.USERPROFILE ?? '', '.dsh', 'our-free-model');
const LOG = path.join(DATA, 'patch-guard.log');
const STATE = path.join(DATA, 'patch-guard-state.json');
const LOCK = path.join(DATA, 'patch-guard.lock');
const TASK = 'OFM-PatchGuard';

const argv = process.argv.slice(2);
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
function snapshot() {
  const version = (() => {
    try { return String(JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version ?? '') } catch { return '' }
  })();
  const read = (rel) => { try { return fs.readFileSync(path.join(PKG, rel), 'utf8') } catch { return '' } };
  const client = read('client.js');
  const pack = read('vendor/channel-pack/pack.js');
  const index = read('index.js');
  return {
    version,
    verify: client.includes("chan.account.verify"),
    isolated: fs.existsSync(path.join(PKG, 'src', 'isolated-login.js')),
    route: index.includes('openIsolatedLogin'),
    parse: pack.includes('validation_url'),
    ads: client.includes('ofm.hide-ads'),
    page: client.includes('function LocalPatchPage'),
  };
}
function healthy(s) {
  return s.verify && s.isolated && s.route && s.parse && s.ads && s.page;
}

if (has('--status')) {
  const s = snapshot();
  console.log(JSON.stringify({ ...s, healthy: healthy(s), state: readJson(STATE, null) }, null, 2));
  process.exit(healthy(s) ? 0 : 1);
}

// ── install / remove the scheduled task ──────────────────────────────────────
if (has('--install') || has('--remove')) {
  if (has('--remove')) {
    const r = spawnSync('schtasks', ['/Delete', '/TN', TASK, '/F'], { encoding: 'utf8' });
    console.log(r.status === 0 ? 'scheduled task removed' : `remove failed: ${r.stderr || r.stdout}`);
    process.exit(r.status === 0 ? 0 : 1);
  }
  const node = process.execPath;
  const self = fileURLToPath(import.meta.url);
  // Every 10 minutes, and once at logon. /RL LIMITED keeps it user-level.
  const tr = `"${node}" "${self}" --quiet`;
  const r = spawnSync('schtasks', [
    '/Create', '/TN', TASK, '/TR', tr, '/SC', 'MINUTE', '/MO', '10', '/F', '/RL', 'LIMITED',
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`install failed: ${r.stderr || r.stdout}`);
    process.exit(1);
  }
  console.log(`scheduled task "${TASK}" installed: every 10 minutes -> ${tr}`);
  process.exit(0);
}

// ── one check ────────────────────────────────────────────────────────────────
if (!fs.existsSync(PATCH)) { note('FATAL: patch script missing at ' + PATCH); process.exit(2) }
if (!fs.existsSync(PKG)) { note('FATAL: plugin directory missing at ' + PKG); process.exit(2) }

// Never fight an upgrade that is mid-flight.
const upState = readJson(path.join(DATA, 'upgrade-state.json'), null);
if (upState && ['installing', 'activating'].includes(upState.phase)) {
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
if (healthy(before)) {
  process.exit(0);
}

note(`patches missing on ${before.version || '?'} — reapplying (verify=${before.verify} isolated=${before.isolated} route=${before.route} parse=${before.parse} ads=${before.ads} page=${before.page})`);

const run = spawnSync(process.execPath, [PATCH, '--pkg', PKG, '--quiet'], { encoding: 'utf8' });
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