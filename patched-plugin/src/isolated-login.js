import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export function isolatedLoginLaunch(rawUrl, options = {}) {
  const url = new URL(rawUrl);
  if (url.origin !== 'https://www.workbuddy.ai' || !url.pathname.startsWith('/login') || url.username || url.password || url.searchParams.has('code')) {
    throw new Error('Only a fresh WorkBuddy international sign-in URL is accepted');
  }
  if ((options.platform ?? process.platform) !== 'win32') throw new Error('Independent Edge sign-in is available on Windows');
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const candidates = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean)
    .map(root => path.join(root, 'Microsoft/Edge/Application/msedge.exe'));
  const executable = candidates.find(exists);
  if (!executable) throw new Error('Microsoft Edge was not found');
  const profile = path.join(env.USERPROFILE, '.dsh/login-browser', 'workbuddy-' + crypto.randomUUID());
  let target = url;
  if (options.googleAccountChooser === true) {
    // WorkBuddy's page can silently reuse its remembered account. Enter its
    // own OIDC broker directly, keeping the fresh plugin state in the callback.
    const callback = new URL(url);
    callback.pathname = '/login/select';
    target = new URL('https://www.workbuddy.ai/auth/realms/copilot/protocol/openid-connect/auth');
    for (const [key, value] of Object.entries({client_id: 'console', response_type: 'code', redirect_uri: callback.toString(), v: '2210', product: 'workbuddy', kc_idp_hint: 'google', prompt: 'select_account'})) target.searchParams.set(key, value);
  }
  return {executable, profile, args: ['--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--new-window', target.toString()]};
}

export async function openIsolatedLogin(rawUrl, options = {}) {
  const launch = isolatedLoginLaunch(rawUrl, options);
  fs.mkdirSync(launch.profile, {recursive: true});
  await new Promise((resolve, reject) => {
    const child = spawn(launch.executable, launch.args, {detached: true, stdio: 'ignore', windowsHide: true});
    child.once('error', reject);
    child.once('spawn', () => {child.unref(); resolve();});
  });
  return {opened: true};
}
