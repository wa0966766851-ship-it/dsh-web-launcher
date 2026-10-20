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
