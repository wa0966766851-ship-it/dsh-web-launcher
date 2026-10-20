# 升級操作（維護者用）

## 基底升級流程（2.5.5 -> 2.5.7 已完成，此為未來版本範本）

1. 下載上游 main zip，解壓到暫存目錄。
2. `node patch-assets/reapply-ofm-patches.mjs --dry-run --pkg <上游解壓目錄>` — 22 項錨點全部通過才繼續；有 ANCHOR PROBLEMS 就停，先修錨點。
3. 備份舊 `patched-plugin` -> `patched-plugin-<舊版>-backup-<時間戳>`。
4. 上游解壓目錄取代 `patched-plugin/`，`patch-assets/` 與 `src/isolated-login.js` 從備份複製回來。
5. `node patch-assets/reapply-ofm-patches.mjs --pkg <patched-plugin>` 實際套用。
6. 執行 `npm test`，並確認 dry-run 的所有產生檔案均通過語法檢查。只看補丁標記不算驗收。
7. `install.ps1` 內的 Spec 版本號同步更新。
8. 同步兩個本機位置：`~/.dsh/profiles/web/node_modules/dsh-our-free-model` 與 `~/dsh-our-free-model`。
9. `ofm-patch-guard.mjs` 的 snapshot/healthy() 若上游改了特徵（例如 2.5.7 移除 sponsor tab、新增 SponsorBanner），同步更新。
10. commit + push 前跑 `npm test`；`tests/patch.test.mjs` 包含語法損壞修復、備份、快取硬連結隔離與控制台 API 測試。另用真實瀏覽器驗證插件頁面。

## 2.5.7 的錨點變化記錄

- `pack.js` 的 `CALL_OLD` 需要 14 個前導空格的縮排。
- sponsor tab/每日彈窗被上游移除，改為 `SponsorBanner` 元件嵌在 free/eac 兩頁；補丁改為 gate 兩處呼叫。
- `hideAds` helper 錨點改為 `SPONSOR_CARD_URL` const 行。
- 頁面路由 `tab === 'picks'` 的縮排從 24 空格改為 20 空格。
