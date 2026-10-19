# Our Free Model — 本地補丁（2.5.5，含自動守護）

## 現在不會再「升級就不見」了
有一個 Windows 排程 **OFM-PatchGuard**，每 10 分鐘檢查一次：
補丁被升級覆蓋掉 → 自動重套 → `autoReloadWatch` 開著時插件自己熱重載。

你不需要做任何事。想手動確認：
```
node "%USERPROFILE%\.dsh\our-free-model\patch-assets\ofm-patch-guard.mjs" --status
```

### 守護者的指令
| 指令 | 作用 |
|---|---|
| （無參數） | 檢查一次，需要時重套 |
| `--status` | 只看狀態，不改任何檔案 |
| `--install` | 註冊排程（已做過） |
| `--remove` | 移除排程 |

日誌：`~/.dsh/our-free-model/patch-guard.log`
上次結果：`~/.dsh/our-free-model/patch-guard-state.json`

守護者的安全設計：
- 每分鐘最多跑一次（鎖檔），不會空轉
- 升級進行中（`installing`/`activating`）直接跳過，不干擾
- 補丁腳本只要有一個錨點對不上就**拒絕寫入任何檔案**，不會寫壞
- 修好會寫日誌；失敗也寫日誌並保留 `patch-guard-state.json` 供診斷

## 補丁內容（24 步）
### 帳號驗證
- `pack.js` 解析 403 `VALIDATION_REQUIRED` 的 `validation_url`
- 經 `extra` 傳到前端，在**該帳號那一行**顯示「完成 Google 帳號驗證」
- 偵測到被拒絕時**自動展開帳號列表**，按鈕直接現身（指名是哪個帳號）

### WorkBuddy 獨立登入
- 還原 `src/isolated-login.js`（升級會刪）
- `index.js` 加 `/channels/login/isolated` 路由
- `client.js` 加「新增其他 Google 帳號」按鈕與 modal 控制項
- 2.5.5 改寫了 `startLogin`，補丁改為**分流**而非整段替換

### 廣告控制（新）
- 內建每日贊助商彈窗與「贊助商」分頁，預設**已隱藏**
- 設定頁新增 **「本地補丁」** 分頁：
  - 廣告開關（即時生效）
  - 補丁狀態自檢（三個燈號）
- 想恢復廣告：把 localStorage `ofm.hide-ads` 設成 `'0'`，或直接用該頁的開關

## 檔案
- `ofm-patch-guard.mjs`     守護者（排程呼叫這個）
- `reapply-ofm-patches.mjs` 實際補丁腳本（24 步，錨點式，冪等）
- `isolated-login.js`       WorkBuddy 模組備份
- `*.patched`               早期版本備份，僅供比對

## 手動重套（守護者失效時）
```
node "%USERPROFILE%\.dsh\our-free-model\patch-assets\reapply-ofm-patches.mjs"
```

## 已知上游問題
`scripts/client-lint.mjs` 在 2.5.x 會失敗：原版 `client.js` 就 `require('react-dom')`，
但 lint 規則只允許 `react`。已用未補丁原檔重現，與本補丁無關。
