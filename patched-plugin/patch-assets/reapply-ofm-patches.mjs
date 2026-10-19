/**
 * reapply-ofm-patches.mjs — re-apply the local Our Free Model patches after an
 * upstream upgrade. Idempotent: safe to run repeatedly.
 *
 * Upstream ships WITHOUT all of the following (verified against 2.0.0 .. 2.5.0):
 *   1. the per-account "verify this Google account" button
 *      (client.js locale + row render; pack.js VALIDATION_REQUIRED parsing)
 *   2. the WorkBuddy "add another Google account" button
 *      (src/isolated-login.js + its route + modal wiring)
 *   3. auto-expanding the account list when a refusal is detected, so that
 *      button is on screen without the user hunting for it
 *
 * The in-app upgrader overwrites every manifest file and DELETES files the new
 * release dropped (src/isolated-login.js), so this must run after each upgrade.
 * Text anchors, not line numbers — the anchors have survived 2.1.0 -> 2.5.0.
 *
 * Usage: node reapply-ofm-patches.mjs [--dry-run] [--pkg <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = HERE;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const QUIET = argv.includes('--quiet');
const say = (...a) => { if (!QUIET) console.log(...a) };
const pkgIdx = argv.indexOf('--pkg');
const PKG = pkgIdx >= 0 ? path.resolve(argv[pkgIdx + 1]) : path.join(process.env.USERPROFILE ?? '', 'dsh-our-free-model');

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

// ─── 0. src/isolated-login.js (the upgrader deletes it) ──────────────────────
if (!fs.existsSync(isoDest)) {
  if (fs.existsSync(isoAsset)) act('restore src/isolated-login.js');
  else problems.push(isoAsset + ' is missing — cannot restore the WorkBuddy isolated-login module');
} else skip('src/isolated-login.js');

// ─── 1. client.js ────────────────────────────────────────────────────────────
let c = fs.readFileSync(clientPath, 'utf8');

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
// 2.5.5 rewrote startLogin (pre-opened popup, /open-external fallback), so the
// old whole-function replacement no longer applies. Instead: take the argument,
// and divert WorkBuddy's URL to the host before any window is opened.
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
    "            // That window uses a throwaway profile, so the account chooser can be",
    "            // forced without disturbing the accounts already signed in here.",
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
// The button has to stay on the offending row — that row is what names the
// account. Expanding just puts it on screen instead of behind a fold.
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

// ─── 2. index.js: isolated-login import + route ──────────────────────────────
let i = fs.readFileSync(indexPath, 'utf8');
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
i = after(i, 'index.js: /channels/login/isolated route', "routePath === '/channels/login/isolated'",
  "      if (method === 'GET' && routePath === '/summary') {\n", ROUTE);

// ─── 3. pack.js: parse VALIDATION_REQUIRED + carry it into `extra` ───────────
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

const CALL_OLD = "const { balance, error, tier } = await fetchGeminiCreditBalance(credential, GEMINI, { force: req.force === true });\n";
const EXTRA_OLD = /const extra = tier === void 0 \? void 0 : \{ accountTier: \{ label: tier\.label, title: `\$\{tier\.name\}\\uFF08\$\{tier\.id\}\\uFF09` \} \};/;
if (p.includes('const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(')) {
  skip('pack.js: extra wiring');
} else if (p.split(CALL_OLD).length - 1 === 1 && EXTRA_OLD.test(p)) {
  act('pack.js: carry validationUrl into extra');
  p = p.replace(CALL_OLD, "const { balance, error, tier, validationUrl } = await fetchGeminiCreditBalance(credential, GEMINI, { force: req.force === true });\n");
  p = p.replace(EXTRA_OLD,
    "const extra = tier === void 0 && validationUrl === void 0 ? void 0 : {\n" +
    "                ...tier === void 0 ? {} : { accountTier: { label: tier.label, title: `${tier.name}\\uFF08${tier.id}\\uFF09` } },\n" +
    "                ...validationUrl === void 0 ? {} : { validationUrl }\n" +
    "              };");
} else problems.push('pack.js: Gemini extra anchor not found (upstream changed it)');

// ─── 4. client.js: hide the built-in sponsor/advertising surfaces ────────────
// 2.5.5 ships a daily sponsor dialog (claimSponsorDay gates every popup) and a
// whole "sponsor" tab. One localStorage switch turns both off. Default: hidden.
// Set localStorage 'ofm.hide-ads' to '0' to bring them back without re-patching.
const AD_GATE_FROM = [
  "  const claim = () => {",
  "    if (!eligible()) return false",
].join('\n');
const AD_GATE_TO = [
  "  const claim = () => {",
  "    if (!eligible()) return false",
  "    // Local ad switch: hidden unless explicitly re-enabled with 'ofm.hide-ads'='0'.",
  "    try { if ((globalThis.localStorage?.getItem('ofm.hide-ads') ?? '1') !== '0') return false } catch {}",
].join('\n');
c = swap(c, 'client.js: suppress daily sponsor popup', "ofm.hide-ads",
  AD_GATE_FROM, AD_GATE_TO);

// Drop the sponsor tab from the nav when ads are hidden.
const TAB_FROM = "        ['sponsor', SPONSOR.title, null],\n";
const TAB_TO = [
  "        hideAds() ? null : ['sponsor', SPONSOR.title, null],",
  "",
].join('\n');
c = swap(c, 'client.js: hide sponsor tab', 'hideAds() ? null :',
  TAB_FROM, TAB_TO);

// The tab list must not carry a null hole.
c = swap(c, 'client.js: filter empty tab slots', '.filter(Boolean)',
  "      ]\n      const nav = h('nav', { className: 'ofm_nav' },",
  "      ].filter(Boolean)\n      const nav = h('nav', { className: 'ofm_nav' },");

// Helper next to the sponsor constants.
c = after(c, 'client.js: hideAds helper', 'function hideAds()',
  "const SPONSOR_DAY_KEY = 'ofm.sponsor.last-shown.v1'\n",
  "\n/** Ad surfaces are off by default; 'ofm.hide-ads'='0' restores them. */\nfunction hideAds() {\n  try { return (globalThis.localStorage?.getItem('ofm.hide-ads') ?? '1') !== '0' } catch { return true }\n}\n");

// ─── 5. client.js: a settings page that owns these switches ──────────────────
// Editing localStorage by hand is not a UI. This tab makes the local patches
// controllable: ad surfaces on/off, and a read-out of which patches are live.
const LOCALE_ZH = [
  "        'nav.tab.localpatch': '\u672C\u5730\u88DC\u4E01',",
  "        'patch.title': '\u672C\u5730\u88DC\u4E01\u8207\u5EE3\u544A\u63A7\u5236',",
  "        'patch.sub': '\u9019\u4E9B\u958B\u95DC\u53EA\u5F71\u97FF\u672C\u6A5F\uFF0C\u4E0D\u6703\u4E0A\u50B3\u3002',",
  "        'patch.ads.title': '\u5EE3\u544A\u8207\u8D0A\u52A9\u5167\u5BB9',",
  "        'patch.ads.hint': '\u95DC\u9589\u5F8C\u4E0D\u6703\u518D\u5F48\u6BCF\u65E5\u8D0A\u52A9\u5EE3\u544A\uFF0C\u300C\u8D0A\u52A9\u5546\u300D\u5206\u9801\u4E5F\u6703\u96B1\u85CF\u3002',",
  "        'patch.ads.toggle': '\u96B1\u85CF\u5EE3\u544A\u8207\u8D0A\u52A9\u5206\u9801',",
  "        'patch.ads.off': '\u5EE3\u544A\u76EE\u524D\u986F\u793A\u4E2D',",
  "        'patch.ads.on': '\u5EE3\u544A\u5DF2\u96B1\u85CF',",
  "        'patch.status.title': '\u88DC\u4E01\u72C0\u614B',",
  "        'patch.status.hint': '\u6BCF\u6B21\u63D2\u4EF6\u5347\u7D1A\u5F8C\u9700\u91CD\u65B0\u5957\u7528\u88DC\u4E01\u3002',",
  "        'patch.status.verify': 'Google \u5E33\u865F\u9A57\u8B49\u6309\u9245',",
  "        'patch.status.isolated': 'WorkBuddy \u7368\u7ACB\u767B\u5165',",
  "        'patch.status.autoexpand': '\u88AB\u62D2\u7D55\u6642\u81EA\u52D5\u5C55\u958B\u5E33\u865F',",
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
  "        'patch.ads.hint': 'Hiding this stops the daily sponsor dialog and removes the sponsor tab.',",
  "        'patch.ads.toggle': 'Hide advertising and the sponsor tab',",
  "        'patch.ads.off': 'Advertising is visible',",
  "        'patch.ads.on': 'Advertising is hidden',",
  "        'patch.status.title': 'Patch status',",
  "        'patch.status.hint': 'Re-apply after every plugin upgrade.',",
  "        'patch.status.verify': 'Google account verify button',",
  "        'patch.status.isolated': 'WorkBuddy isolated sign-in',",
  "        'patch.status.autoexpand': 'Auto-expand on refusal',",
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
  "      const [hideAdsState, setHideAdsState] = useState(() => hideAds())",
  "      const [saved, setSaved] = useState('')",
  "      const toggleAds = () => {",
  "        const next = !hideAdsState",
  "        try {",
  "          if (next) window.localStorage?.removeItem('ofm.hide-ads')",
  "          else window.localStorage?.setItem('ofm.hide-ads', '0')",
  "        } catch { /* private mode: the toggle still applies for this session */ }",
  "        setHideAdsState(next)",
  "        setSaved(t('patch.sub'))",
  "      }",
  "      // Self-report: each flag is computed from the module itself, so a",
  "      // half-applied patch is visible instead of silently assumed.",
  "      const checks = [",
  "        [t('patch.status.verify'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.verify === true],",
  "        [t('patch.status.isolated'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.isolated === true],",
  "        [t('patch.status.autoexpand'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.autoexpand === true],",
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
  "            h(Switch, { checked: hideAdsState, label: t('patch.ads.toggle'), onChange: toggleAds }),",
  "            h('span', { className: 'ofm_note' }, hideAdsState ? t('patch.ads.on') : t('patch.ads.off'))),",
  "          saved === '' ? null : h('p', { className: 'ofm_note' }, saved)),",
  "        h(Section, { title: t('patch.status.title'), hint: t('patch.status.hint') },",
  "          ...checks.map(([label, ok]) => h('div', { className: 'ofm_row', key: label },",
  "            h(Pill, { tone: ok ? 'ok' : 'warn' }, ok ? t('patch.status.on') : t('patch.status.off')),",
  "            h('span', { className: 'ofm_note' }, label))),",
  "          h('div', { className: 'ofm_row' },",
  "            h('span', { className: 'ofm_note' }, t('patch.note'))))",
  "    }",
  "",
].join('\n');
// The page is inserted before PicksPage and closes itself; PicksPage's own
// header line is preserved as the anchor tail.
c = swap(c, 'client.js: LocalPatchPage component', 'function LocalPatchPage(props)',
  "    function PicksPage(props) {\n",
  [
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
    "      // Read off the module itself, so a half-applied patch shows as missing.",
    "      const checks = [",
    "        [t('patch.status.verify'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.verify === true],",
    "        [t('patch.status.isolated'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.isolated === true],",
    "        [t('patch.status.autoexpand'), typeof LOCAL_PATCHES !== 'undefined' && LOCAL_PATCHES.autoexpand === true],",
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
    "            h(Switch, { checked: adsHidden, label: t('patch.ads.toggle'), onChange: toggleAds }),",
    "            h('span', { className: 'ofm_note' }, adsHidden ? t('patch.ads.on') : t('patch.ads.off')))),",
    "        h(Section, { title: t('patch.status.title'), hint: t('patch.status.hint') },",
    "          checks.map(([label, ok]) => h('div', { className: 'ofm_row', key: label },",
    "            h(Pill, { tone: ok ? 'ok' : 'warn' }, ok ? t('patch.status.on') : t('patch.status.off')),",
    "            h('span', { className: 'ofm_note' }, label))),",
    "          h('div', { className: 'ofm_row' },",
    "            h('span', { className: 'ofm_note' }, t('patch.note')))))",
    "    }",
    "",
    "    function PicksPage(props) {",
  ].join('\n'));

// 5d. the self-report marker the page reads
const MARKER = [
  "/** Set by the local patch script; the Local patches page reads it back. */",
  "const LOCAL_PATCHES = Object.freeze({ verify: true, isolated: true, autoexpand: true })",
  "",
].join('\n');
c = after(c, 'client.js: LOCAL_PATCHES marker', 'const LOCAL_PATCHES = Object.freeze(',
  "const SPONSOR_DAY_KEY = 'ofm.sponsor.last-shown.v1'\n", "\n" + MARKER);

// 5e. register the tab
c = swap(c, 'client.js: localpatch in TABS', "'localpatch'",
  "const TABS = ['free', 'eac', 'channels', 'aggregate', 'saver', 'routing', 'ledger', 'logs', 'gateway', 'upgrade', 'picks', 'sponsor']",
  "const TABS = ['free', 'eac', 'channels', 'aggregate', 'saver', 'routing', 'ledger', 'logs', 'gateway', 'upgrade', 'picks', 'sponsor', 'localpatch']");

// 5f. tab entry in the nav list
c = after(c, 'client.js: localpatch nav entry', "['localpatch', t('nav.tab.localpatch'), null]",
  "        hideAds() ? null : ['sponsor', SPONSOR.title, null],\n",
  "        ['localpatch', t('nav.tab.localpatch'), null],\n");

// 5g. route it to the page
c = swap(c, 'client.js: localpatch page route', "tab === 'localpatch'",
  "      const page = tab === 'sponsor'",
  "      const page = tab === 'localpatch'\n        ? h(LocalPatchPage, { t })\n        : tab === 'sponsor'");

// ─── write ───────────────────────────────────────────────────────────────────
say('');
if (problems.length > 0) {
  console.error('ANCHOR PROBLEMS — nothing written:');
  for (const m of problems) console.error('  ! ' + m);
  process.exit(1);
}
if (DRY) { say('dry run: ' + applied + ' change(s) would be applied'); process.exit(0); }
if (!fs.existsSync(isoDest) && fs.existsSync(isoAsset)) fs.copyFileSync(isoAsset, isoDest);
fs.writeFileSync(clientPath, c, 'utf8');
fs.writeFileSync(indexPath, i, 'utf8');
fs.writeFileSync(packPath, p, 'utf8');
say('applied ' + applied + ' change(s)');