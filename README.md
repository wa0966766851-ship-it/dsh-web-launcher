# DSH Web 啟動台

Windows x64 的 DeepSeek Harness Web 安裝器與視覺化啟動台。瀏覽器與 Edge 應用程式模式都使用 `web` profile，插件和對話共用。

## 一行安裝

在 PowerShell 貼上：

```powershell
irm https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/bootstrap.ps1 | iex
```

也可以把本專案的 `Install.cmd` 傳給朋友，雙擊即可執行同一個 GitHub 安裝流程。這個入口沒有綁定作者的電腦路徑或帳號。

## 已安裝者：修補與控制台更新

```powershell
irm https://raw.githubusercontent.com/wa0966766851-ship-it/dsh-web-launcher/main/patch.ps1 | iex
```

也可雙擊 `Repair.cmd`。它會找出桌面 `DSH` 或 `%LOCALAPPDATA%\DSHLauncher\app` 的既有安裝，備份程式、更新控制台及修復已安裝的插件。保留帳號、對話、連結依賴、設定及瀏覽器資料，不重裝整套環境。若 DSH 正在執行，補丁通過驗證後會重新啟動；執行中的工作會中斷。新版控制台也提供「修復補丁並重啟」。

1.1.0 修復前版補丁輸出的非法換行字元及頁面括號錯誤，解決 Our Free Model 的 `import failed`。現在先驗證全部產生的 JavaScript，再備份及寫入；不認識的語法錯誤或上游錨點變更會拒絕寫入。控制台及守護任務都會檢查前端語法，不再只看文字標記。新版改用更新啟用前與啟動前檢查，不再安裝定期守護排程。

安裝器會從 GitHub 下載本專案。缺少相容 Node.js 時，從 nodejs.org 下載 Node.js 24 並核對官方 SHA256；只放在使用者目錄。接著檢查或安裝 DSH、插件管理所需的 pnpm、三個插件，建立桌面「DSH 啟動台」捷徑及 BAT 後備入口，啟動同一份 web profile。首次下載相依套件可能需要數分鐘。

需要連線下載，沒有提供完整離線安裝。通常不需管理員權限。朋友應在自己的 Windows 帳號執行，帳號登入、Google 驗證、API Key 由本人在 DSH 設定完成；程式沒有攜帶作者的設定或憑證。

## 1.2.0：事件觸發的更新保護

- 不需要常駐守護程序或每十分鐘排程。啟動台關閉後，自己的後台約一分鐘內退出；DSH 繼續執行。舊版排程可用「移除舊版排程」清除。
- 透過 OFM 內建更新器更新時，仍先驗證上游簽章與檔案雜湊，再套用並檢查補丁，通過才熱重載。錨點不相容時不啟用該版，由上游更新交易還原原檔；備份損壞或還原失敗會保留復原狀態並停止繼續更新。
- 經啟動台啟動或重新啟動前會檢查補丁，並嘗試從更新前的驗證備份復原中斷交易。此功能要求先前曾經套用新版保護，才會有包外復原模組。
- F5／「重新載入此頁」只更新控制台與補丁狀態，不重啟 DSH，也不在執行中的服務裡改寫多個檔案。需要修補時明確使用「修復補丁並重啟」。
- 「開啟 DSH 視窗（不重啟）」使用現有服務；「重載外掛（不重啟 DSH）」只重載 OFM，並確認其重載計數變更。外掛重載可能影響該外掛執行中的請求，適合在空閒時操作。
- 控制台開啟／F5 或手動按「檢查新版與專案搬移」時查詢 GitHub。一般結果快取六小時，手動按鈕強制重查；按儲存庫固定 ID 偵測搬移與封存，不會自動信任新位置或安裝程式。顯示的是上游預設分支 package.json 版本，不代表 npm 已發布；公開 API 限流時會改查 GitHub 頁面，仍須核對同一個儲存庫固定 ID；查詢失敗保留目前安裝。
- 舊安裝入口會改走目前修補流程；目前安裝器保留較新的 OFM，修補入口拒絕把較新版啟動台降版。完全離線的新安裝仍需先恢復下載連線。

這套保護處理已知更新器流程，不保證任意未來版本都相容。外部工具直接覆蓋插件、刪除包外補丁資產或改用另一個啟動入口，可能繞過更新攔截；請用啟動台的修復入口處理。上游大改時應保留可用舊版，調整補丁後再升級。

## 預設元件與來源

| 元件 | 版本／來源 |
| --- | --- |
| DeepSeek Harness | npm `@deepseek-ai/dsh@0.2.0-rc.2`，[官方原始碼](https://github.com/deepseek-ai/deepseek-harness) |
| Our Free Model | [上游原始碼](https://github.com/Ebony-Vinyl/dsh-our-free-model/tree/4e44d453183ca2b60a424c190e501a192078308a) 2.5.7，固定 commit `4e44d453183ca2b60a424c190e501a192078308a`，再套本專案補丁 |
| 浮游球 | npm `dsh-orb@0.1.7`，[原始碼](https://github.com/mini-yifan/dsh-orb-cordis) |
| GAL 視窗 | [Ayase34/gal-view](https://github.com/Ayase34/gal-view)，固定 commit `d002fe0e7051c618a2665af3c653f9838cd6aa8a` |

已安裝的 DSH、其他啟用中的插件會保留。完整安裝器只會將較舊的一般 OFM 依賴升級為上述驗證版本，保留較新的已安裝版本；自訂 `link:`／`file:` 依賴不會被取代，版本不相容時會停下並說明。修補入口僅修復現有版本，不升級來源。npm 上尚無 2.5.7，因此不能使用 `npm install dsh-our-free-model@2.5.7`。第一次啟用浮游球可能另外下載 Electron。插件服務可用性、免費模型額度與登入政策由各提供者決定，安裝成功不代表每個模型都能聊天。

選用 [dsh-ops](https://github.com/T-Auto/dsh-ops)：

```powershell
& "$env:LOCALAPPDATA\DSHLauncher\app\install.ps1" -IncludeOps
```

預設使用上游 shell/file 組件，不會額外開啟 PTC/background。不承諾固定 token 節省倍率。沒有預設加裝其他來源的網路、模型切換或歷史壓縮插件，以免增加相容性變數。

## 使用

- 雙擊桌面「DSH 啟動台」；按啟動會開啟選定模式的 DSH。
- 「開啟 DSH」使用已驗證的登入網址；「停止」只處理確認屬於 DSH 的背景服務與浮游球。
- 重複啟動會重用既有服務。若 DSH 還在執行但所有登入網址失效，啟動會重新建立服務；正在執行中的任務可能因此中止，日誌會說明。
- 若連接埠由其他程式占用，啟動、停止及重啟都會報告，不會結束該程式。
- 更換連接埠前先停止服務。應用程式模式需要 Edge；找不到時改開預設瀏覽器。
- UI 關閉後 DSH 保持運作；這不是 Windows 開機自啟動項目。
- VBScript 不可用時，使用桌面 `DSH-Launcher.bat`。

## 設定與備份

程式：`%LOCALAPPDATA%\DSHLauncher\app`；可攜 Node：`%LOCALAPPDATA%\DSHLauncher\node`。DSH 預設資料：`%USERPROFILE%\.dsh`。支援既有 `DSH_HOME` 環境變數。

共用日誌在 `$DSH_HOME\launcher\server.stdout.log`、`server.stderr.log`；登入網址來自本次服務啟動日誌及已驗證的舊位置，不會把「連接埠打得開」當成已登入。每次驗證都要成功交換 cookie 並取得 HTML HTTP 200。

設定備份在 `$DSH_HOME\backups\launcher-install-*`。本機網址和帳號資料不會上傳 GitHub。日誌面板會遮蔽網址 token，複製登入網址功能則由使用者自行操作；請勿公開分享該網址。

## 驗證界線

`npm test` 驗證網址解析、認證交換、非 DSH 服務保護、併發啟動互斥等。發布前另做隔離 profile 安裝與本機服務啟停驗收。模型聊天、Google 驗證和付費 API 不屬於安裝驗收；請在自己的帳號設定後測試。

若重新執行 GitHub 指令，會備份舊程式並重試缺少的元件。修改既有來源碼者請先自行保留其變更。

---

## patched-plugin/

`patched-plugin/` 收錄 **Our Free Model 2.5.7 的本地補丁版**：補回上游缺少的
Google 帳號驗證按鈕、WorkBuddy 獨立登入視窗，並加上廣告開關及更新啟用前的補丁檢查。
詳見 [patched-plugin/README.md](patched-plugin/README.md)。
