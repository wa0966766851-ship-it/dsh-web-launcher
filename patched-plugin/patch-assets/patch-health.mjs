import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function inspectPatch(pkg) {
  const read = name => { try { return fs.readFileSync(path.join(pkg, name), 'utf8'); } catch { return ''; } };
  const client = read('client.js'), index = read('index.js'), pack = read('vendor/channel-pack/pack.js');
  let version = ''; try { version = JSON.parse(read('package.json')).version || ''; } catch {}
  let syntaxError = null;
  try { if (!client) throw Error('client.js is missing'); new vm.Script(client, {filename: 'client.js'}); }
  catch (e) { syntaxError = e.message; }
  const status = {
    version, syntax: syntaxError === null, syntaxError,
    verify: client.includes('chan.account.verify'),
    isolated: fs.existsSync(path.join(pkg, 'src/isolated-login.js')),
    route: index.includes('openIsolatedLogin'), parse: pack.includes('validation_url'),
    updateGate: index.includes('localUpdateSafety.guardedApply'),
    reloadGate: index.includes('assertReloadSafe(PKG_DIR)'),
    autoexpand: client.includes('const verifySeen = useRef(new Set())'),
    ads: client.includes('ofm.hide-ads'), page: client.includes('function LocalPatchPage'),
    banner: (client.match(/hideAds\(\) \? null : h\(SponsorBanner/g) || []).length === 2,
  };
  status.healthy = ['syntax','verify','isolated','route','parse','autoexpand','ads','page','banner'].every(key => status[key]);
  return status;
}
