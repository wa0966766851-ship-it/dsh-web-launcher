/**
 * reapply-ofm-patches.mjs — re-apply the local Our Free Model patches after an
 * upstream upgrade. Idempotent: safe to run repeatedly.
 *
 * Upstream ships WITHOUT all of the following (verified against 2.0.0 .. 2.5.7):
 *   1. the per-account "verify this Google account" button
 *      (client.js locale + row render; pack.js VALIDATION_REQUIRED parsing)
 *   2. the WorkBuddy "add another Google account" button
 *      (src/isolated-login.js + its route + modal wiring)
 *   3. auto-expanding the account list when a refusal is detected, so that
 *      button is on screen without the user hunting for it
 *
 * 2.5.6+ removed the sponsor tab and the daily sponsor dialog; a
 * `SponsorBanner` component is now embedded at the top of the free/eac pages
 * (2 call sites in client.js). This patch keeps the LOCAL_PATCHES page and
 * hides that banner behind the same 'ofm.hide-ads' localStorage switch, so the
 * patch-status page survives upgrades and the banner stays controllable.
 *
 * The in-app upgrader overwrites every manifest file and DELETES files the new
 * release dropped (src/isolated-login.js), so this must run after each upgrade.
 * Text anchors, not line numbers — the anchors have survived 2.1.0 -> 2.5.7.
 *
 * Usage: node reapply-ofm-patches.mjs [--dry-run] [--pkg <dir>] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { acquirePatchLock } from './update-safety.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = HERE;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const QUIET = argv.includes('--quiet');
const say = (...a) => { if (!QUIET) console.log(...a) };
const pkgIdx = argv.indexOf('--pkg');
const PKG = fs.realpathSync(pkgIdx >= 0 ? path.resolve(argv[pkgIdx + 1]) : path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles/web/node_modules/dsh-our-free-model'));
if(!argv.includes('--owned-lock')){
  const stateFile=path.join(process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),'our-free-model/upgrade-state.json');
  if(fs.existsSync(stateFile)){
    const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(['installing','activating','recovery-required'].includes(state.phase))throw Error('上次更新尚未完成，請先復原；不會覆寫復原資料。');
  }
}
if (!DRY && !argv.includes('--owned-lock')) {
  const release=acquirePatchLock(PKG);
  process.once('exit',release);
}

const clientPath = path.join(PKG, 'client.js');
const indexPath = path.join(PKG, 'index.js');
const packPath = path.join(PKG, 'vendor', 'channel-pack', 'pack.js');
const isoDest = path.join(PKG, 'src', 'isolated-login.js');
const isoAsset = path.join(ASSETS, 'isolated-login.js');

const problems = [];
let applied = 0;
const act = (m) => { applied++; say('  + ' + m); };
const skip = (m) => say('  = ' + m + ' (already patched)');

for (const f of [clientPath, indexPath, packPath]) {
  if (!fs.existsSync(f)) { console.error('FATAL: missing ' + f); process.exit(2); }
}

function swap(text, label, marker, from, to) {
  if (text.includes(marker)) { skip(label); return text; }
  const n = text.split(from).length - 1;
  if (n !== 1) { problems.push(label + ': anchor matched ' + n + ' times, expected 1'); return text; }
  act(label);
  return text.replace(from, to);
}

function after(text, label, marker, anchor, body) {
  if (text.includes(marker)) { skip(label); return text; }
  const n = text.split(anchor).length - 1;
  if (n !== 1) { problems.push(label + ': anchor matched ' + n + ' times, expected 1'); return text; }
  act(label);
  return text.replace(anchor, anchor + body);
}

// ─── 0. src/isolated-login.js (the upgrader deletes it) ────────────────
if (!fs.existsSync(isoDest)) {
  if (fs.existsSync(isoAsset)) act('restore src/isolated-login.js');
  else problems.push(isoAsset + ' is missing — cannot restore the WorkBuddy isolated-login module');
} else skip('src/isolated-login.js');

// ─── 1. client.js ─────────────────────────────────────────────────────
let c = fs.readFileSync(clientPath, 'utf8');
// Repair the exact malformed separator emitted by the previous patch release.
const malformed = "'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',```n";
if (c.includes(malformed)) { c = c.replace(malformed, malformed.slice(0, -4) + '\n'); act('repair malformed locale separator'); }
c = c.replace("'script.sub': 'These switches affect this machine only. Nothing is uploaded.'", "'patch.sub': 'These switches affect this machine only. Nothing is uploaded.'");
c = c.replace("            h('span', { className: 'ofm_note' }, t('patch.note'))))\n", "            h('span', { className: 'ofm_note' }, t('patch.note')))))\n");

const ZH_NEW = [
  "        'chan.account.verify': '\u5B8C\u6210 Google \u5E33\u865F\u9A57\u8B49',",
  "        'chan.login.other': '\u65B0\u589E\u5176\u4ED6 Google \u5E33\u865F',",
  "        'chan.login.isolated': '\u958B\u555F\u7368\u7ACB\u767B\u5165\u8996\u7A97',",
  "        'chan.login.isolatedNote': '\u8ACB\u5728\u65B0\u7684 Edge \u8996\u7A97\u9078\u64C7\u8981\u65B0\u589E\u7684 Google \u5E33\u865F\u3002\u5B8C\u6210\u5F8C\u56DE\u5230\u9019\u88E1\uFF1B\u539F\u6709\u5E33\u865F\u4E0D\u53D7\u5F71\u97FF\u3002',",
].join('\n') + '\n';
c = after(c, 'client.js: zh locale keys', "'chan.account.verify'",
  "        'chan.login.open': '\u6253\u5F00\u767B\u5F55\u9875',\n", ZH_NEW);

const EN_NEW = [
  "        'chan.account.verify': 'Verify this Google account',",
  "        'chan.login.other': 'Add another Google account',",
  "        'chan.login.isolated': 'Open independent sign-in window',",
  "        'chan.login.isolatedNote': 'Choose the Google account to add in the new Edge window, then return here. Existing accounts are preserved.',",
].join('\n') + '\n';
c = after(c, 'client.js: en locale keys', "'chan.account.verify': 'Verify this Google",
  "        'chan.login.open': 'Open sign-in page',\n", EN_NEW);

// 1c. the per-account verify button (it is what names the offending account)
const VERIFY_JSX = [
  "                    channel.id === 'gemini' && (balances ?? []).find(entry => entry.accountId === row.id)?.extra?.validationUrl",
  "                      ? h('a', { className: 'ofm_minibtn', href: (balances ?? []).find(entry => entry.accountId === row.id).extra.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('chan.account.verify')) : null,",
].join('\n') + '\n';
c = after(c, 'client.js: per-account verify button', "channel.id === 'gemini' && (balances ?? []).find(entry => entry.accountId === row.id)?.extra?.validationUrl",
  "                  h('span', { className: 'ofm_acctacts' },\n", VERIFY_JSX);

// 1d. startLogin: route WorkBuddy through the isolated sign-in window.
c = swap(c, 'client.js: startLogin signature',
  'const startLogin = async (chooseGoogle = false)',
  'const startLogin = async () => {',
  [
    "const startLogin = async (chooseGoogle = false) => {",
    "        chooseGoogle = chooseGoogle === true && channel.id === 'workbuddy'",
  ].join('\n'));

c = after(c, 'client.js: startLogin isolated divert', "const isolatedDivert = channel.id === 'workbuddy'",
  "            if (!opened) {\n" +
  "              try { opened = (await post('/open-external', { url }, 15_000))?.opened === true } catch { /* manual link remains available */ }\n" +
  "            }\n",
  [
    "",
    "            // WorkBuddy: hand the URL to the host's isolated Edge window instead.",
    "            const isolatedDivert = channel.id === 'workbuddy'",
    "            if (isolatedDivert) {",
    "              try {",
    "                await post('/channels/login/isolated', { url, googleAccountChooser: chooseGoogle })",
    "                opened = true",
    "              } catch { /* fall through to the normal opener */ }",
    "            }",
  ].join('\n'));

// 1e. WorkBuddy "add another Google account" button
const ADD_ANCHOR = "          h('button', { type: 'button', className: 'ofm_btn', disabled: busy !== '' || !rpc, 'aria-busy': busy === 'add' ? 'true' : undefined, onClick: startLogin }, busy === 'add' ? '\u2026' : t('chan.act.add')),\n";
const OTHER_BTN = "          channel.id === 'workbuddy' ? h('button', { type: 'button', className: 'ofm_btn', disabled: busy !== '' || !rpc, onClick: () => startLogin(true) }, t('chan.login.other')) : null,\n";
c = after(c, 'client.js: WorkBuddy add-another button', "onClick: () => startLogin(true) }, t('chan.login.other')", ADD_ANCHOR, OTHER_BTN);

// 1f. login modal isolated controls
const FOOT_FROM = [
  "          h('div', { className: 'ofm_modalfoot' },",
  "            login.url === '' ? null : h('a', { className: 'ofm_btn primary', href: login.url, target: '_blank', rel: 'noreferrer noopener' }, t('chan.login.open')),",
  "            h('button', { type: 'button', className: 'ofm_btn ghost', onClick: () => setLogin(null) }, t('chan.login.cancel')))))",
  "",
].join('\n');
const FOOT_TO = [
  "          h('div', { className: 'ofm_modalfoot' },",
  "            login.isolated ? h('p', { className: 'ofm_note' }, t('chan.login.isolatedNote')) : null,",
  "            login.url === '' ? null : login.isolated",
  "              ? h('button', { type: 'button', className: 'ofm_btn primary', onClick: () => post('/channels/login/isolated', { url: login.url, googleAccountChooser: login.chooseGoogle }).catch(error => onError(channel, error)) }, t('chan.login.isolated'))",
  "              : h('a', { className: 'ofm_btn primary', href: login.url, target: '_blank', rel: 'noreferrer noopener' }, t('chan.login.open')),",
  "            h('button', { type: 'button', className: 'ofm_btn ghost', onClick: () => setLogin(null) }, t('chan.login.cancel')))))",
  "",
].join('\n');
c = swap(c, 'client.js: login modal isolated controls', "login.isolated ? h('p', { className: 'ofm_note' }, t('chan.login.isolatedNote'))", FOOT_FROM, FOOT_TO);

// 1g. auto-expand the account list when a refusal shows up, once per account.
const LOADBAL_ANCHOR = [
  "      useEffect(() => {",
  "        setBalances(undefined); setBalanceError('')",
  "        void loadBalances()",
  "        return () => { balanceGeneration.current++; balancePending.current = null }",
  "      }, [loadBalances])",
  "",
].join('\n');
const AUTOEXPAND = [
  "      // A Google account that needs verification is only discoverable from the",
  "      // quota answer (403 VALIDATION_REQUIRED + validation_url). When one shows",
  "      // up, open the account list so the per-account button is on screen — the",
  "      // row is what tells the user WHICH account to verify. One expand per",
  "      // newly-refused account, so a manual collapse is not fought.",
  "      const verifySeen = useRef(new Set())",
  "      useEffect(() => {",
  "        if (channel.id !== 'gemini' || !Array.isArray(balances)) return",
  "        const fresh = balances.filter(entry => {",
  "          const url = entry?.extra?.validationUrl",
  "          return typeof url === 'string' && url !== '' && !verifySeen.current.has(entry.accountId)",
  "        })",
  "        if (fresh.length === 0) return",
  "        for (const entry of fresh) verifySeen.current.add(entry.accountId)",
  "        setOpen('accounts')",
  "      }, [balances, channel.id])",
  "",
].join('\n');
c = after(c, 'client.js: auto-expand accounts on refusal', 'const verifySeen = useRef(new Set())', LOADBAL_ANCHOR, AUTOEXPAND);

// ─── 2. index.js: isolated-login import + route ────────────────────────
let i = fs.readFileSync(indexPath, 'utf8');
i = swap(i, 'index.js: local update activation gate', 'localUpdateSafety.guardedApply',
  '      const result = await updater.apply({',
  "      const localUpdateSafety = await import((await import('node:url')).pathToFileURL(path.join(resolveDshHome(), 'our-free-model/patch-assets/update-safety.mjs')).href)\n      const result = await localUpdateSafety.guardedApply(updater, {");
i = after(i, 'index.js: isolated-login import', "import { openIsolatedLogin } from './src/isolated-login.js'",
  "import { createEacLoginPoller } from './src/eac-login.js'\n",
  "import { openIsolatedLogin } from './src/isolated-login.js'\n");

const ROUTE = [
  "      if (method === 'POST' && routePath === '/channels/login/isolated') {",
  "        const body = await readJson(req)",
  "        if (typeof body?.url !== 'string') return send(400, { error: 'Sign-in URL required' })",
  "        try { return send(200, await openIsolatedLogin(body.url, { googleAccountChooser: body.googleAccountChooser === true })) }",
  "        catch (error) { return send(400, { error: error.message }) }",
  "      }",
  "",
].join('\n');
// 錨點必須是 `/summary` 區塊的**結束括號**，不能是它的 `{`。
// 舊實作把 ROUTE 插在 `/summary {` 之後 → handler 被埋進那個 `if` 裡，
// 外層條件是 GET/summary、內層卻是 POST/login —— 永遠不成立，
// 於是「新增其他 Google 帳號」永遠打不開隔離視窗（實測 2026-10-22）。
const SUMMARY_BLOCK_END = "      if (method === 'GET' && routePath === '/summary') {\n        return send(200, buildSummary(deps))\n      }\n";
if (!i.includes("routePath === '/channels/login/isolated'")) {
  if (!i.includes(SUMMARY_BLOCK_END)) {
    problems.push('index.js: /summary block not in expected shape - cannot place the isolated-login route safely');
  } else {
    act('index.js: /channels/login/isolated route');
    i = i.replace(SUMMARY_BLOCK_END, SUMMARY_BLOCK_END + ROUTE);
  }
} else { skip('index.js: /channels/login/isolated route'); }

// ─── 3. pack.js: parse VALIDATION_REQUIRED + carry it into `extra` ──────
let p = fs.readFileSync(packPath, 'utf8');
const BAL_FROM = [
  "  if (!response.ok) {",
  "    return {",
  "      balance: null,",
  "      // \u26A0\uFE0F 403 \u6709\u4E24\u79CD\u6210\u56E0",
].join('\n');
const BAL_TO = [
  "  if (!response.ok) {",
  "    let validationUrl;",
  "    try {",
  "      const detail = JSON.parse(text)?.error?.details?.find(item => item.reason === \"VALIDATION_REQUIRED\");",
  "      if (detail?.metadata?.validation_url) {",
  "        const candidate = new URL(detail.metadata.validation_url);",
  "        if (candidate.protocol === \"https:\" && candidate.hostname === \"accounts.google.com\" && !candidate.username && !candidate.password) validationUrl = candidate.toString();",
  "      }",
  "    } catch {}",
  "    return {",
  "      balance: null,",
  "      ...validationUrl === void 0 ? {} : { validationUrl },",
  "      // \u26A0\uFE0F 403 \u6709\u4E24\u79CD\u6210\u56E0",
].join('\n');
p = swap(p, 'pack.js: parse VALIDATION_REQUIRED', 'item.reason === "VALIDATION_REQUIRED"', BAL_FROM, BAL_TO);

const CALL_OLD = "              const { balance, error, tier } = await fetchGeminiCreditBalance(credential, GEMINI, { force: req.force === true });\n";
const EXTRA_OLD = '              const extra = tier === void 0 ? void 0 : { accountTier: { label: tier.label, title: `${tier.name}\\uFF08${tier.id}\\uFF09` } };\n';
const EXTRA_NEW = '              const extra = tier === void 0 && validationUrl === void 0 ? void 0 : {\n                ...tier === void 0 ? {} : { accountTier: { label: tier.label, title: `${tier.name}\\uFF08${tier.id}\\uFF09` } },\n                ...validationUrl === void 0 ? {} : { validationUrl }\n              };\n';
if (p.includes('const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(')) {
  skip('pack.js: extra wiring');
} else if (p.split(CALL_OLD).length - 1 === 1 && p.split(EXTRA_OLD).length - 1 === 1) {
  act('pack.js: carry validationUrl into extra');
  p = p.replace(CALL_OLD, "              const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(credential, GEMINI, { force: req.force === true });\n");
  p = p.replace(EXTRA_OLD, EXTRA_NEW);

} else problems.push('pack.js: Gemini extra anchor not found (upstream changed it)');

// ─── 4. client.js: hide the SponsorBanner (2.5.6+ embedded banner) ────
// The banner is rendered by 2 call sites; gate both behind hideAds().
const CALL_OLD2 = "        h(SponsorBanner, { t }),\n";
const CALL_NEW2 = "        hideAds() ? null : h(SponsorBanner, { t }),\n";
if (c.split(CALL_NEW2).length - 1 === 2) {
  skip('client.js: hide SponsorBanner (2.5.7 embedded)');
} else {
  const n = c.split(CALL_OLD2).length - 1;
  if (n === 2) {
    act('client.js: hide SponsorBanner (2.5.7 embedded) x2');
    c = c.split(CALL_OLD2).join(CALL_NEW2);
  } else {
    problems.push('client.js: SponsorBanner call anchor matched ' + n + ' times, expected 2');
  }
}

// The hideAds helper, next to the sponsor constants.
c = after(c, 'client.js: hideAds helper', 'function hideAds()',
  "const SPONSOR_CARD_URL = 'https://beichenapi.com/register?aff=DL49WAC2DQNG'\n",
  "\n/** Ad surfaces are off by default; 'ofm.hide-ads'='0' restores them. */\nfunction hideAds() {\n  try { return (globalThis.localStorage?.getItem('ofm.hide-ads') ?? '1') !== '0' } catch { return true }\n}\n");

// ─── 5. client.js: the Local patches page ──────────────────────────────
const LOCALE_ZH = [
  "        'nav.tab.localpatch': '\u672C\u5730\u88DC\u4E01',",
  "        'patch.title': '\u672C\u5730\u88DC\u4E01\u8207\u5EE3\u544A\u63A7\u5236',",
  "        'patch.sub': '\u9019\u4E9B\u958B\u95DC\u53EA\u5F71\u97FF\u672C\u6A5F\uFF0C\u4E0D\u6703\u4E0A\u50B3\u3002',",
  "        'patch.ads.title': '\u5EE3\u544A\u8207\u8D0A\u52A9\u5167\u5BB9',",
  "        'patch.ads.hint': '\u95DC\u9589\u5F8C\u514D\u8CBB\u6A21\u578B\u9801\u9762\u9802\u90E8\u7684\u8D0A\u52A9\u6A2A\u5E45\u6703\u96B1\u85CF\u3002',",
  "        'patch.ads.toggle': '\u96B1\u85CF\u8D0A\u52A9\u6A2A\u5E45\u8207\u5EE3\u544A',",
  "        'patch.ads.off': '\u8D0A\u52A9\u6A2A\u5E45\u76EE\u524D\u986F\u793A\u4E2D',",
  "        'patch.ads.on': '\u8D0A\u52A9\u6A2A\u5E45\u5DF2\u96B1\u85CF',",
  "        'patch.status.title': '\u88DC\u4E01\u72C0\u614B',",
  "        'patch.status.hint': '\u6BCF\u6B21\u63D2\u4EF6\u5347\u7D1A\u5F8E\u9700\u91CD\u65B0\u5957\u7528\u88DC\u4E01\uFF08\u8B0D\u7121\u64CD\u5FC3\uFF0C\u5B88\u8B77\u4EFB\u52D9\u6703\u81EA\u52D5\u88DC\u4E0A\uFF09\u3002',",
  "        'patch.status.verify': 'Google \u5E33\u865F\u9A57\u8B49\u6309\u9215',",
  "        'patch.status.isolated': 'WorkBuddy \u7368\u7ACB\u767B\u5165',",
  "        'patch.status.autoexpand': '\u88AB\u62D2\u7D55\u6642\u81EA\u52D5\u5C55\u939B\u5E33\u865F\u6E05\u55AE',",
  "        'patch.status.banner': '\u8D0A\u52A9\u6A2A\u5E45\u96B1\u85CF\u958B\u95DC',",
  "        'patch.status.on': '\u5DF2\u5957\u7528',",
  "        'patch.status.off': '\u672A\u5957\u7528',",
  "        'patch.note': '\u88DC\u4E01\u8173\u672C\uFF1Apatch-assets/reapply-ofm-patches.mjs',",
].join('\n') + '\n';
c = after(c, 'client.js: localpatch zh locale', "'patch.status.title'",
  "        'chan.login.open': '\u6253\u5F00\u767B\u5F55\u9875',\n", LOCALE_ZH);

const LOCALE_EN = [
  "        'nav.tab.localpatch': 'Local patches',",
  "        'patch.title': 'Local patches & advertising',",
  "        'patch.sub': 'These switches affect this machine only. Nothing is uploaded.',",
  "        'patch.ads.title': 'Advertising and sponsor content',",
  "        'patch.ads.hint': 'Hiding this stops the sponsor banner on the free/eac pages.',",
  "        'patch.ads.toggle': 'Hide the sponsor banner',",
  "        'patch.ads.off': 'The banner is visible',",
  "        'patch.ads.on': 'The banner is hidden',",
  "  'patch.status.title': 'Patch status',",
  "        'patch.status.hint': 'Re-apply after every plugin upgrade (the guard task re-applies automatically).',",
  "        'patch.status.verify': 'Google account verify button',",
  "        'patch.status.isolated': 'WorkBuddy isolated sign-in',",
  "        'patch.status.autoexpand': 'Auto-expand on refusal',",
  "        'patch.status.banner': 'Sponsor banner switch',",
  "        'patch.status.on': 'applied',",
  "        'patch.status.off': 'missing',",
  "        'patch.note': 'Patch script: patch-assets/reapply-ofm-patches.mjs',",
].join('\n') + '\n';
c = after(c, 'client.js: localpatch en locale', "'patch.status.verify': 'Google account verify button'",
  "        'chan.login.open': 'Open sign-in page',\n", LOCALE_EN);

// The page component itself, inserted before PicksPage.
const PAGE = [
  "    /** Owns the local switches: ad surfaces, and a read-out of live patches. */",
  "    function LocalPatchPage(props) {",
  "      const { t } = props",
  "      const [adsHidden, setAdsHidden] = useState(() => hideAds())",
  "      const toggleAds = () => {",
  "        const next = !adsHidden",
  "        try {",
  "          if (next) window.localStorage?.removeItem('ofm.hide-ads')",
  "          else window.localStorage?.setItem('ofm.hide-ads', '0')",
  "        } catch { /* private mode: applies for this session only */ }",
  "        setAdsHidden(next)",
  "      }",
  "      const checks = [",
  "        [t('patch.status.verify'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.verify === true],",
  "        [t('patch.status.isolated'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.isolated === true],",
  "        [t('patch.status.autoexpand'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.autoexpand === true],",
  "        [t('patch.status.banner'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.banner === true],",
  "      ]",
  "      return h('div', { className: 'ofm_page' },",
  "        h('header', { className: 'ofm_hero ofm_glass' },",
  "          h('span', { className: 'ofm_recoglow', 'aria-hidden': 'true' }),",
  "          h('div', { className: 'ofm_pagehead' },",
  "            h('div', { className: 'ofm_pagetitle' },",
  "              h('h2', null, t('patch.title')),",
  "              h('p', { className: 'ofm_pagesub' }, t('patch.sub'))))),",
  "        h(Section, { title: t('patch.ads.title'), hint: t('patch.ads.hint') },",
  "          h('div', { className: 'ofm_row' },",
  "            h('button', { type: 'button', className: 'ofm_btn', onClick: toggleAds }, adsHidden ? t('patch.ads.on') : t('patch.ads.off')),",
  "            h('span', { className: 'ofm_note' }, t('patch.ads.toggle')))),",
  "        h(Section, { title: t('patch.status.title'), hint: t('patch.status.hint') },",
  "          ...checks.map(([label, ok]) => h('div', { className: 'ofm_row', key: label },",
  "            h('span', { className: 'ofm_note' }, label),",
  "            h('span', { className: 'ofm_note' }, ok ? t('patch.status.on') : t('patch.status.off')))),",
  "          h('div', { className: 'ofm_row' },",
  "            h('span', { className: 'ofm_note' }, t('patch.note')))))",
  "    }",
  "",
].join('\n');
c = swap(c, 'client.js: LocalPatchPage component', 'function LocalPatchPage(props)',
  "    function PicksPage(props) {\n",
  PAGE + "    function PicksPage(props) {\n");

// The self-report marker the page reads
const MARKER = [
  "/** Set by the local patch script; the Local patches page reads it back. */",
  "const LOCAL_PATCHES = Object.freeze({ verify: true, isolated: true, autoexpand: true, banner: true })",
  "",
].join('\n');
c = after(c, 'client.js: LOCAL_PATCHES marker', 'const LOCAL_PATCHES = Object.freeze(',
  "const SPONSOR_CARD_URL = 'https://beichenapi.com/register?aff=DL49WAC2DQNG'\n",
  "\n" + MARKER);

// 5e. register the tab
c = swap(c, 'client.js: localpatch in TABS', "'localpatch'",
  "const TABS = ['free', 'eac', 'channels', 'aggregate', 'saver', 'routing', 'ledger', 'logs', 'gateway', 'upgrade', 'picks']",
  "const TABS = ['free', 'eac', 'channels', 'aggregate', 'saver', 'routing', 'ledger', 'logs', 'gateway', 'upgrade', 'picks', 'localpatch']");

// 5f. tab entry in the nav list
c = after(c, 'client.js: localpatch nav entry', "['localpatch', t('nav.tab.localpatch'), null]",
  "        ['picks', t('nav.tab.picks'), null],\n",
  "        ['localpatch', t('nav.tab.localpatch'), null],\n");

// 5g. route it to the page
c = swap(c, 'client.js: localpatch page route', "tab === 'localpatch'",
  "                    : tab === 'picks'\n                      ? h(PicksPage, { t })",
  "                    : tab === 'localpatch'\n                      ? h(LocalPatchPage, { t })\n                    : tab === 'picks'\n                      ? h(PicksPage, { t })");
c = c.replace("return TABS.includes(saved) ? saved : 'free'", "return saved !== 'localpatch' && TABS.includes(saved) ? saved : 'free'");
c = c.replace(/('patch\.status\.hint': ')([^'\n]*)(')/g, (_, a, text, b) => a + (/[\u3400-\u9fff]/.test(text) ? '更新啟用前會檢查補丁；不相容則由更新器回退。此頁可直接關閉。' : 'Patches are checked before activation; incompatible updates roll back. This page can be closed.') + b);

i = swap(i, 'index.js: reload health gate', 'assertReloadSafe(PKG_DIR)',
  '    const result = await selfReload(ctx, { logger, packageUrl: PKG_URL.href, entryUrl: ENTRY_URL })',
  "    const localReloadSafety = await import((await import('node:url')).pathToFileURL(path.join(resolveDshHome(), 'our-free-model/patch-assets/update-safety.mjs')).href)\n    localReloadSafety.assertReloadSafe(PKG_DIR)\n    const result = await selfReload(ctx, { logger, packageUrl: PKG_URL.href, entryUrl: ENTRY_URL })");

// ─── write ─────────────────────────────────────────────────────────────
say('');
if (problems.length > 0) {
  console.error('ANCHOR PROBLEMS — nothing written:');
  for (const m of problems) console.error('  ! ' + m);
  process.exit(1);
}
const planned = new Map([[clientPath,c],[indexPath,i],[packPath,p]]);
planned.set(isoDest, fs.readFileSync(fs.existsSync(isoDest)?isoDest:isoAsset,'utf8'));
// Validate every generated file before changing any live plugin file.
for (const [file, contents] of planned) {
  const result = spawnSync(process.execPath, ['--check','--input-type',file === clientPath ? 'commonjs' : 'module'], {input:contents,encoding:'utf8',windowsHide:true,timeout:15000});
  if (result.status !== 0) { console.error('Syntax validation failed for '+path.relative(PKG,file)+'; nothing written.\n'+result.stderr); process.exit(1); }
}
if (DRY) { say('dry run: ' + applied + ' change(s) would be applied; syntax checks passed'); process.exit(0); }
const changed = [...planned].filter(([file,contents]) => !fs.existsSync(file) || fs.readFileSync(file,'utf8') !== contents);
if (changed.length) {
  const backupArg=argv.indexOf('--backup-dir');
  const backupRoot=backupArg >= 0 ? path.resolve(argv[backupArg+1]) : path.join(process.env.DSH_HOME || path.join(os.homedir(),'.dsh'),'backups');
  const backup=path.join(backupRoot,'ofm-patch-'+Date.now()+'-'+process.pid);
  const originals=new Map();
  for (const [file] of changed) {
    const previous=fs.existsSync(file)?fs.readFileSync(file):null; originals.set(file,previous);
    if (previous) { const target=path.join(backup,path.relative(PKG,file)); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,previous); }
  }
  // Replace files instead of truncating them: pnpm may hard-link the original
  // to its shared store or another profile.
  const replaceFile=(file,contents)=>{const temporary=file+'.ofm-'+process.pid+'.tmp';try{fs.writeFileSync(temporary,contents);fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}};
  const committed=[];
  try { for (const [file,contents] of changed) {replaceFile(file,contents);committed.push(file);} }
  catch(e) { for (const file of committed.reverse()) {const previous=originals.get(file);if(previous)replaceFile(file,previous);else if(fs.existsSync(file))fs.unlinkSync(file);} throw e; }
  say('backup: '+backup);
}
say('applied ' + applied + ' change(s)');




