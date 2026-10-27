# 本地補丁版 Our Free Model (2.5.7 patched)

基於上游 [Ebony-Vinyl/dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model) `main`（2.5.7）。

## 補丁內容（全部冪等，可重複套用）

| 補丁 | 檔案 | 說明 |
| --- | --- | --- |
| Google 帳號驗證按鈕 | client.js + vendor/channel-pack/pack.js | 403 `VALIDATION_REQUIRED` 的 quota 回應帶有 `validation_url`，解析後在帳號列顯示「完成 Google 帳號驗證」按鈕 |
| WorkBuddy 獨立登入視窗 | src/isolated-login.js + index.js + client.js | 「新增其他 Google 帳號」按鈕，經主程序開獨立 Edge 視窗登入，不干擾既有帳號 |
| 拒絕時自動展開帳號清單 | client.js | 偵測到需要驗證的帳號時自動展開清單，按鈕直接在畫面上 |
| **贊助橫幅隱藏開關** | client.js | 2.5.6+ 改為嵌在免費模型/EAC 頁面頂部的 `SponsorBanner`；本補丁把它 gate 在 `localStorage['ofm.hide-ads']`（預設隱藏） |
| 本地補丁頁面 | client.js | 新增「本地補丁」分頁：廣告開關 + 補丁狀態自檢（4 項） |
| **Gemini 多模型擴充** | vendor/channel-pack/pack.js | 上游只註冊 `gemini-3.8-flash` 一個模型。本補丁加入 `gemini-2.5-flash`、`gemini-2.5-flash-lite`、`gemini-2.5-pro`、`claude-sonnet-4-6`（Antigravity 通道實測可用） |
| **isolated 路由錯誤嵌套修復** | index.js | 舊補丁把 `/channels/login/isolated` 插進了 `GET /summary` 的 if 區塊內，導致 POST 永遠進不來。本補丁偵測並重排 |
| **login.isolated 欄位補齊** | client.js | `setLogin()` 補上 `isolated: isolatedDivert`，讓彈窗的「重新開啟」按鈕走對分支 |
| **移除提前 popup 導航** | client.js | 舊版在 isolated 分流「之前」就把一般 popup 導向 /login，抵銷隔離設計。本補丁移除該區塊，確保獨立視窗優先 |

## 已知問題與修正記錄（2026-10-28）

### 已修正

| 問題 | 症狀 | 修正 |
| --- | --- | --- |
| **isolated 路由錯誤嵌套** | 點「新增其他 Google 帳號」後，獨立 Edge 視窗不開啟；網路面板看不到 `POST /channels/login/isolated` 請求 | `index.js` 把路由移出 `GET /summary` 區塊，改為平級獨立 `if` |
| **login.isolated 未賦值** | 登入彈窗的「開啟獨立登入視窗」按鈕走一般登入頁分支 | `setLogin()` 加入 `isolated: isolatedDivert` |
| **登入順序錯誤** | 一般 popup 先導航到 /login，才嘗試獨立視窗，造成帳號混淆 | **移除提前導航區塊**，改為 isolated 優先、失敗才退回一般 popup |

### 驗證方式

```powershell
# 檢查 index.js 路由結構（isolated 應在 /summary 之後且平級）
node -e "const fs=require('fs');const L=fs.readFileSync('index.js','utf8').split('
');const s=L.findIndex(l=>l.includes("routePath === '/summary'"));const i=L.findIndex(l=>l.includes('channels/login/isolated'));console.log('summary@'+(s+1),'isolated@'+(i+1),'ok='+(i>s))"

# 檢查 client.js 欄位
node -e "const fs=require('fs');const s=fs.readFileSync('client.js','utf8');console.log('isolated 欄位:', s.includes('isolated: isolatedDivert'))"
```

### 未修正（上游限制，非本專案問題）

- **Gemini Pro 系列**：Google 於 2026-04-01 將 Gemini 2.5 Pro / 3 Pro / 3.1 Pro 從免費層移除。Antigravity 通道的 `gemini-2.5-pro` 會回 503 `MODEL_CAPACITY_EXHAUSTED`，屬上游限流
- **Claude Opus**：Antigravity 的 3p 配額雖包含 Opus，但 API 只開放 `claude-sonnet-4-6`
- **Gemini 週配額**：免費帳號每週有上限，用盡後所有 Gemini 模型都會回 `UNSUPPORTED_LOCATION` 或空回應，需等重置（每週固定時間）

## 升級後重新套用

每次插件升級都會覆蓋補丁。守護任務（`ofm-patch-guard.mjs`，每 10 分鐘）會自動補上；手動：

```powershell
node patch-assets\reapply-ofm-patches.mjs --pkg <插件目錄>
```

守護任務是選用功能，已安裝者的完整修補與控制台更新：

```powershell
irm https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/patch.ps1 | iex
```

守護任務安裝/狀態：

```powershell
node patch-assets\ofm-patch-guard.mjs --install   # 註冊排程（每 10 分鐘）
node patch-assets\ofm-patch-guard.mjs --status    # 自檢
```

## 給朋友的指令（在 DSH 對話框貼上）

**安裝/升級 Our Free Model 到 2.5.7 並自動套用本地補丁：**

```
請幫我安裝或升級 Our Free Model 插件到 2.5.7，並套用本地補丁：
1. 關閉正在執行的 DSH Web 服務（若 3080 被佔用，確認是 DSH 的 node 程序後停止它）。
2. 2.5.7 尚未發布到 npm；使用本專案完整安裝器會從已固定的上游 GitHub commit 安裝，請勿要求 npm 安裝不存在的版本。
3. 安裝完成後執行補丁腳本：node <launcher 目錄>\patched-plugin\patch-assets\reapply-ofm-patches.mjs --pkg <插件 node_modules 位置>
4. 重新啟動 DSH Web，確認設定 → Our Free Model 出現「本地補丁」分頁且 4 項狀態為「已套用」。
```

## 給朋友的行內指令（PowerShell 一行）

```powershell
irm https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/bootstrap.ps1 | iex
```

這會安裝啟動台（含 2.5.7 patched 插件安裝流程），自動偵測既有安裝，不會重複安裝。
