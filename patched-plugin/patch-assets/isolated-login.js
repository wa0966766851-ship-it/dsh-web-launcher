import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

/**
 * 為什麼每次都用「全新的 user-data-dir」：
 *
 * WorkBuddy 的登入頁會優先使用瀏覽器既有的登入態。若沿用同一個 profile，
 * 第二次按「新增其他 Google 帳號」時，頁面會直接回跳已登入的帳號，
 * 使用者永遠選不到第二個 Google 帳號（實測 2026-10-22：profile 目錄自
 * 10/12 起沒再新增，代表視窗根本沒重開）。
 *
 * 每次用 randomUUID() 建一個從未存在過的目錄，Edge 首次啟動時：
 *   - Default/Network/Cookies 為 0 筆
 *   - Default/Login Data 為 0 筆
 *   - 沒有任何 localStorage / session 殘留
 * 因此必定呈現未登入狀態，Google 帳號選擇器一定會出現。
 *
 * 驗證方式（2026-10-29 實測）：
 *   msedge --user-data-dir=<全新目錄> about:blank
 *   → cookies 0 筆、logins 0 筆
 */

/** WorkBuddy 國際版只接受自己的登入頁；其他來源一律拒絕。 */
const ALLOWED_ORIGIN = 'https://www.workbuddy.ai';

export function isolatedLoginLaunch(rawUrl, options = {}) {
  const url = new URL(rawUrl);
  if (url.origin !== ALLOWED_ORIGIN || !url.pathname.startsWith('/login') ||
      url.username || url.password || url.searchParams.has('code')) {
    throw new Error('Only a fresh WorkBuddy international sign-in URL is accepted');
  }
  if ((options.platform ?? process.platform) !== 'win32') {
    throw new Error('Independent Edge sign-in is available on Windows');
  }

  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const candidates = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA]
    .filter(Boolean)
    .map(root => path.join(root, 'Microsoft/Edge/Application/msedge.exe'));
  const executable = candidates.find(exists);
  if (!executable) throw new Error('Microsoft Edge was not found');

  // 每次一個全新目錄 —— 這是「必定未登入」的唯一保證。
  const profile = path.join(env.USERPROFILE, '.dsh/login-browser', 'workbuddy-' + crypto.randomUUID());

  // ⚠️ 直接用上游 account.create 回傳的 loginUrl，不改寫任何 OAuth 參數。
  //
  // 舊版會自行組裝 OIDC 授權網址（client_id / redirect_uri / kc_idp_hint /
  // prompt=select_account）。WorkBuddy 目前的登入規則會把這種自組請求判為
  // 「帳號訪問受限」（實測 2026-10-29：同一個帳號在官網可登入、用一般「新增
  // 帳號」也可登入，只有自組 OIDC 被拒）。上游程式碼也特別註明不得重組登入
  // 網址，因為路徑與 state 都由服務端決定。
  //
  // 「選哪個 Google 帳號」交給全新 profile + Google 自己的帳號選擇器處理：
  // 因為沒有任何既有 session，Google 一定會列出帳號讓使用者挑。
  return {
    executable,
    profile,
    args: [
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=msEdgeIdentityFRE,msImplicitSignin',
      '--new-window',
      url.toString(),
    ],
  };
}

export async function openIsolatedLogin(rawUrl, options = {}) {
  const launch = isolatedLoginLaunch(rawUrl, options);
  fs.mkdirSync(launch.profile, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(launch.executable, launch.args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { opened: true };
}

/**
 * 清掉過期的獨立登入 profile。每次登入都會新建目錄，累積下來會佔空間；
 * 保留 24 小時內的（使用者可能還在授權途中），其餘刪除。
 */
export function pruneIsolatedProfiles(options = {}) {
  const env = options.env ?? process.env;
  const root = path.join(env.USERPROFILE, '.dsh/login-browser');
  const keepMs = options.keepMs ?? 24 * 60 * 60 * 1000;
  let removed = 0;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return { removed: 0 }; }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('workbuddy-')) continue;
    const full = path.join(root, entry.name);
    try {
      const age = Date.now() - fs.statSync(full).mtimeMs;
      if (age > keepMs) { fs.rmSync(full, { recursive: true, force: true }); removed++; }
    } catch { /* 目錄正被使用或已消失：略過 */ }
  }
  return { removed };
}