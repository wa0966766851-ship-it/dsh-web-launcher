#!/usr/bin/env node
/**
 * login-flow-test.mjs — WorkBuddy 獨立登入流程的回歸測試。
 *
 * 這個測試存在的理由：這條流程出過兩次同類 bug，而且兩次都「看起來修好了」：
 *
 *   1. `/channels/login/isolated` 路由被插進 `GET /summary` 的 if 區塊內。
 *      外層要求 GET、內層要求 POST，所以 POST 永遠進不來。介面照樣顯示
 *      「已套用」，因為自檢只查字串存不存在。
 *   2. `isolatedOk` 加上了，但舊的「提前把 popup 導到 /login」區塊沒刪。
 *      popup 先載入 /login，WorkBuddy 用既有登入態直接回跳，
 *      獨立視窗永遠不會開 —— 症狀和完全沒修一樣。
 *
 * 所以這裡斷言的不是「某段字串存在」，而是**順序與層級**：
 * isolated 分流必須真的跑在第一次 popup 導航之前。
 *
 * 用法:
 *   node login-flow-test.mjs                    # 測目前的 patched-plugin
 *   node login-flow-test.mjs --pkg <dir>        # 測指定的插件目錄
 *   node login-flow-test.mjs --self-test        # 反向驗證：故意餵壞資料，斷言必須失敗
 *
 * 離開碼: 0 全部通過 / 1 有失敗 / 2 環境問題
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const pkgIdx = argv.indexOf('--pkg');
const PKG = pkgIdx >= 0 ? path.resolve(argv[pkgIdx + 1]) : path.resolve(HERE, '..');
const SELF_TEST = argv.includes('--self-test');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log('  ok   ' + name + (detail ? '  — ' + detail : ''));
  } else {
    fail++;
    failures.push(name + (detail ? '  — ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? '  — ' + detail : ''));
  }
}

function read(rel) {
  const p = path.join(PKG, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function lines(text) {
  return text.split(/\r?\n/);
}

/** 找第一個符合的行號（0-based），沒有回 -1。 */
function firstLine(arr, needle, from = 0) {
  for (let i = from; i < arr.length; i++) {
    if (typeof arr[i] === 'string' && arr[i].includes(needle)) return i;
  }
  return -1;
}

/**
 * 判斷某一行是否落在 `openIdx` 那個 if 區塊內。
 * 從 openIdx 起算大括號深度，回到 0 之前都算「在裡面」。
 * 這是抓 bug 1 的關鍵：isolated 路由若在 /summary 的深度內，就是壞的。
 */
function insideBlock(arr, openIdx, targetIdx) {
  if (openIdx < 0 || targetIdx < 0 || targetIdx <= openIdx) return false;
  let depth = 0;
  for (let i = openIdx; i < targetIdx; i++) {
    const line = arr[i];
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth <= 0) return false; // 區塊在 targetIdx 之前就閉合了
  }
  return depth > 0;
}

console.log('login-flow-test  target=' + PKG);
if (SELF_TEST) console.log('  (self-test 模式：預期下列斷言全部失敗)');
console.log('');

/* ── 讀檔 ───────────────────────────────────────────────────────────── */

const clientSrc = read('client.js');
const indexSrc = read('index.js');
const isoSrc = read('src/isolated-login.js');
const patchSrc = read('patch-assets/reapply-ofm-patches.mjs');

if (clientSrc === null || indexSrc === null) {
  console.error('找不到 client.js 或 index.js，確認 --pkg 是否指向插件目錄');
  process.exit(2);
}

const C = lines(clientSrc);
const I = lines(indexSrc);

/* ── 1. 後端：isolated 路由必須是平級獨立 if，不能嵌在 /summary 裡 ── */

console.log('[1] index.js — isolated 路由層級');

const summaryIdx = firstLine(I, "routePath === '/summary'");
const isolatedIdx = firstLine(I, "routePath === '/channels/login/isolated'");

check('找到 /summary 路由', summaryIdx >= 0, summaryIdx >= 0 ? '行 ' + (summaryIdx + 1) : '');
check('找到 isolated 路由', isolatedIdx >= 0, isolatedIdx >= 0 ? '行 ' + (isolatedIdx + 1) : '');

if (summaryIdx >= 0 && isolatedIdx >= 0) {
  check('isolated 在 /summary 之後', isolatedIdx > summaryIdx,
    '/summary@' + (summaryIdx + 1) + ' isolated@' + (isolatedIdx + 1));

  // 關鍵斷言：isolated 不能在 /summary 的大括號深度內
  const nested = insideBlock(I, summaryIdx, isolatedIdx);
  check('isolated 不在 /summary 區塊內', !nested,
    nested ? '被 /summary 包住 → POST 永遠進不來' : '平級');

  // 兩者縮排應相同
  const indSum = (I[summaryIdx].match(/^\s*/) || [''])[0].length;
  const indIso = (I[isolatedIdx].match(/^\s*/) || [''])[0].length;
  check('isolated 與 /summary 同縮排', indSum === indIso,
    'summary=' + indSum + ' isolated=' + indIso);
}

// isolated 路由必須帶 POST 判斷
if (isolatedIdx >= 0) {
  const isoLine = I[isolatedIdx];
  check("isolated 路由要求 POST", isoLine.includes("'POST'"),
    isoLine.includes("'POST'") ? '' : '缺少 POST 判斷');
}

// index.js 必須 import openIsolatedLogin
check('index.js 匯入 openIsolatedLogin', indexSrc.includes("from './src/isolated-login.js'"));
check('isolated-login.js 存在', isoSrc !== null);

/* ── 2. 前端：isolated 分流必須跑在第一次 popup 導航之前 ── */

console.log('');
console.log('[2] client.js — 登入順序');

const divertIdx = firstLine(C, "const isolatedDivert = channel.id === 'workbuddy'");
const firstNavIdx = firstLine(C, 'attempt.popup.location.replace(url)');

check('找到 isolatedDivert 定義', divertIdx >= 0,
  divertIdx >= 0 ? '行 ' + (divertIdx + 1) : '');
check('找到 popup 導航', firstNavIdx >= 0,
  firstNavIdx >= 0 ? '行 ' + (firstNavIdx + 1) : '');

if (divertIdx >= 0 && firstNavIdx >= 0) {
  check('isolatedDivert 在第一次 popup 導航之前', divertIdx < firstNavIdx,
    'divert@' + (divertIdx + 1) + ' nav@' + (firstNavIdx + 1) +
    (divertIdx < firstNavIdx ? '' : ' → 提前導航會讓隔離視窗永遠不開'));
}

// isolatedOk 旗標與 fallback 結構
check('有 isolatedOk 旗標', clientSrc.includes('let isolatedOk = false'));
check('有 !isolatedOk 的 fallback 分支', clientSrc.includes('if (!isolatedOk)'));

// isolated 分流裡必須真的呼叫路由
if (divertIdx >= 0) {
  const window = C.slice(divertIdx, divertIdx + 30).join('\n');
  check('分流內呼叫 /channels/login/isolated',
    window.includes("post('/channels/login/isolated'"));
  check('分流內帶 googleAccountChooser',
    window.includes('googleAccountChooser: chooseGoogle'));
}

/* ── 3. setLogin 必須帶 isolated 欄位 ── */

console.log('');
console.log('[3] client.js — login 狀態');

const setLoginIdx = firstLine(C, 'setLogin({ accountId');
check('找到 setLogin 呼叫', setLoginIdx >= 0,
  setLoginIdx >= 0 ? '行 ' + (setLoginIdx + 1) : '');

if (setLoginIdx >= 0) {
  const line = C[setLoginIdx];
  check('setLogin 帶 isolated 欄位', /isolated\s*:/.test(line),
    /isolated\s*:/.test(line) ? '' : '彈窗的「重新開啟」會走錯分支');
  check('setLogin 帶 chooseGoogle 欄位', /chooseGoogle/.test(line),
    /chooseGoogle/.test(line) ? '' : '重送時會遺失帳號選擇意圖');
}

// 彈窗必須讀 login.isolated
check('彈窗讀取 login.isolated', clientSrc.includes('login.isolated'));

// 作用域：isolatedDivert 必須定義在 setLogin 所在（或更外層）的作用域。
// 實際踩過的坑：定義留在 `if (url !== '')` 區塊內（縮排 12），setLogin 在區塊外
// （縮排 10）呼叫，執行期直接報 "isolatedDivert is not defined" —— 語法檢查抓不到。
const divertDefIdx = firstLine(C, "const isolatedDivert = channel.id === 'workbuddy'");
if (divertDefIdx >= 0 && setLoginIdx >= 0) {
  const defIndent = (C[divertDefIdx].match(/^\s*/) || [''])[0].length;
  const useIndent = (C[setLoginIdx].match(/^\s*/) || [''])[0].length;
  check('isolatedDivert 定義在 setLogin 之前', divertDefIdx < setLoginIdx,
    'def@' + (divertDefIdx + 1) + ' use@' + (setLoginIdx + 1));
  check('isolatedDivert 縮排不大於 setLogin（同層或更外層）', defIndent <= useIndent,
    'def=' + defIndent + ' use=' + useIndent +
    (defIndent <= useIndent ? '' : ' → 定義在內層區塊，setLogin 取不到'));
}

/* ── 4. 補丁腳本必須能修復舊版 ── */

console.log('');
console.log('[4] reapply-ofm-patches.mjs — 升級修復能力');

if (patchSrc === null) {
  // 已安裝的插件目錄不含 patch-assets（那是啟動器專案的資產），
  // 這種情況下第 4 組不適用 —— 跳過而不是判失敗。
  console.log('  skip 目標目錄不含 patch-assets（已安裝插件），跳過升級修復檢查');
} else {
  check('補丁能偵測並重排錯誤嵌套',
    patchSrc.includes('repairNestedIsolatedRoute'),
    patchSrc.includes('repairNestedIsolatedRoute') ? '' : '舊安裝的壞路由不會被修');
  // 修復模組本身也要存在且可載入
  const repairSrc = read('patch-assets/route-repair.mjs');
  check('修復模組存在', repairSrc !== null && repairSrc.includes('repairNestedIsolatedRoute'));
  check('補丁能移除提前導航', patchSrc.includes('EARLY_NAV'),
    patchSrc.includes('EARLY_NAV') ? '' : '舊安裝仍會保留提前導航');
  check('補丁會補 setLogin 欄位', patchSrc.includes('login.isolated 欄位'));
}

/* ── 5. 模型清單（附帶檢查，避免多模型補丁被升級蓋掉）── */

console.log('');
console.log('[5] pack.js — 模型清單');

const packSrc = read('vendor/channel-pack/pack.js');
if (packSrc === null) {
  console.log('  skip 找不到 pack.js（非完整安裝時可略過）');
} else {
  const block = packSrc.match(/var GEMINI_FALLBACK_MODELS = \[([\s\S]*?)\];/);
  check('找到 GEMINI_FALLBACK_MODELS', block !== null);

  if (block) {
    const ids = [...block[1].matchAll(/id:\s*(GEMINI_UPSTREAM_FLASH|"[^"]+")/g)]
      .map((m) => m[1].replace(/"/g, ''));
    const resolved = ids.map((x) => (x === 'GEMINI_UPSTREAM_FLASH' ? 'gemini-3.8-flash' : x));

    check('模型清單非空', resolved.length > 0, resolved.join(', '));
    check('保留 gemini-3.8-flash', resolved.includes('gemini-3.8-flash'));
    check('含 claude-sonnet-4-6', resolved.includes('claude-sonnet-4-6'),
      resolved.includes('claude-sonnet-4-6') ? '' : 'Antigravity 通道的 Claude 會消失');
  }

  check('模型驗證已放寬（KNOWN_GEMINI_MODELS）',
    packSrc.includes('KNOWN_GEMINI_MODELS'),
    packSrc.includes('KNOWN_GEMINI_MODELS') ? '' : '只有 3.8-flash 能用');
}

/* ── 6. EAC 授權按鈕必須可重試（不能被殘留 pending 卡死）── */

console.log('');
console.log('[6] client.js — EAC 授權按鈕可重試');

// 舊版的 login() 對 pendingRef.current !== null 直接 return，按鈕又設了
// disabled: pending !== null，於是殘留 pending 會讓按鈕完全失效。
const loginFnIdx = firstLine(C, 'const login = async () =>');
if (loginFnIdx >= 0) {
  const fnWindow = C.slice(loginFnIdx, loginFnIdx + 14).join('\n');
  const silentReturn = /if \(starting\.current \|\| cancelling\.current \|\| pendingRef\.current !== null\) return/.test(fnWindow);
  check('login() 不因殘留 pending 靜默返回', !silentReturn,
    silentReturn ? '舊寫法：pending 卡住時點擊無反應' : '');
  check('login() 會先作廢殘留 pending',
    fnWindow.includes('updatePending(null)') && fnWindow.includes('eac/login/cancel'));
} else {
  check('找到 login() 定義', false);
}

// 按鈕不得因 pending 而 disabled
check('主按鈕不因 pending 而禁用',
  !clientSrc.includes("disabled: busy || pending !== null"),
  clientSrc.includes("disabled: busy || pending !== null") ? '按鈕會被卡死' : '');
check('模型卡按鈕不因 pending 而禁用',
  !clientSrc.includes("disabled: eacLogin.busy || eacLogin.pending !== null"),
  clientSrc.includes("disabled: eacLogin.busy || eacLogin.pending !== null") ? '按鈕會被卡死' : '');

// 重試文案存在
check('有 eac.retry 文案', clientSrc.includes("'eac.retry'"));

// 補丁腳本必須能修舊安裝
if (patchSrc !== null) {
  check('補丁含 EAC 按鈕修復',
    patchSrc.includes('EAC 按鈕可重試'),
    patchSrc.includes('EAC 按鈕可重試') ? '' : '舊安裝升級後按鈕仍會卡');
}

/* ── self-test：故意破壞輸入，斷言必須失敗 ───────────────────────────── */

if (SELF_TEST) {
  console.log('');
  console.log('[self-test] 反向驗證');

  // 造一份「isolated 嵌在 /summary 裡」的壞 index.js
  const brokenIndex = [
    "      if (method === 'GET' && routePath === '/summary') {",
    "      if (method === 'POST' && routePath === '/channels/login/isolated') {",
    '        return send(200, {})',
    '      }',
    '        return send(200, buildSummary(deps))',
    '      }',
  ];
  const bs = firstLine(brokenIndex, "routePath === '/summary'");
  const bi = firstLine(brokenIndex, "routePath === '/channels/login/isolated'");
  check('[self-test] 偵測到嵌套（應為 true）', insideBlock(brokenIndex, bs, bi));

  // 造一份「popup 導航在 isolated 之前」的壞 client.js
  const brokenClient = [
    'let opened = false',
    'attempt.popup.location.replace(url)',
    "const isolatedDivert = channel.id === 'workbuddy'",
  ];
  const bd = firstLine(brokenClient, "const isolatedDivert");
  const bn = firstLine(brokenClient, 'attempt.popup.location.replace(url)');
  check('[self-test] 偵測到順序錯誤（應為 true）', bd > bn);
}

/* ── 結果 ───────────────────────────────────────────────────────────── */

console.log('');
console.log('─'.repeat(60));
console.log(pass + ' 通過 / ' + fail + ' 失敗');

if (fail > 0) {
  console.log('');
  console.log('失敗項目:');
  for (const f of failures) console.log('  - ' + f);
  console.log('');
  console.log('修復方式: node patch-assets/reapply-ofm-patches.mjs --pkg ' + PKG);
  process.exit(1);
}

console.log('全部通過');
process.exit(0);