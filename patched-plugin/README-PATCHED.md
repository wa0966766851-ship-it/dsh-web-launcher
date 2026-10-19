# DSH Our Free Model — 本地補丁版 (2.5.5)

這是 [Our Free Model](https://github.com/Ebony-Vinyl/dsh-our-free-model) 插件的**本地補丁版**，
由 `wa0966766851-ship-it` 維護，用來補回上游缺少的功能。

> 上游版本：**2.5.5**　補丁套用日期：2026-10-19

---

## 這個版本多了什麼

### 1. Google 帳號驗證按鈕
上游在 `VALIDATION_REQUIRED` 時只把錯誤字串丟到帳號列，沒有提供任何操作入口。

本版補回：
- `pack.js` 解析 403 回應裡的 `validation_url`（含安全校驗：必須 `https`、host 必須是 `accounts.google.com`、不得含帳密）
- 該 URL 經 `extra` 傳到前端
- **在該帳號那一行**顯示「完成 Google 帳號驗證」按鈕
- 偵測到被拒絕時**自動展開帳號列表**，按鈕直接現身——不必自己翻找是哪個帳號

### 2. WorkBuddy 獨立登入視窗
上游移除了 `src/isolated-login.js` 整個模組與 `/channels/login/isolated` 路由，
導致無法「新增其他 Google 帳號」。

本版還原該模組與路由，並在 WorkBuddy 卡片加上「新增其他 Google 帳號」按鈕。
獨立視窗使用一次性 Edge profile，**不會干擾既有已登入帳號**。

### 3. 廣告控制
上游內建每日贊助商彈窗與「贊助商」分頁。

本版預設**隱藏**兩者，並在設定頁新增「本地補丁」分頁：
- 廣告開關（即時生效）
- 補丁狀態自檢（三個燈號）

要恢復廣告：把 localStorage `ofm.hide-ads` 設為 `'0'`，或用該頁的開關。

---

## 升級後補丁會消失 — 已自動處理

插件的內建升級器會覆蓋所有檔案，並**刪除不在新清單裡的檔案**
（`src/isolated-login.js` 就是這樣消失的）。所以每次升級補丁都會沒。

本版附帶 **`patch-assets/ofm-patch-guard.mjs`** 守護者：

```powershell
node patch-assets\ofm-patch-guard.mjs --install   # 註冊 Windows 排程（每 10 分鐘）
node patch-assets\ofm-patch-guard.mjs --status    # 看狀態
node patch-assets\ofm-patch-guard.mjs --remove    # 移除排程
```

守護者偵測到補丁被覆蓋會**自動重套**。安全設計：
- 每分鐘最多一次（鎖檔）
- 升級進行中直接跳過
- 錨點對不上時**拒絕寫入任何檔案**，不會寫壞
- 成敗都寫日誌：`~/.dsh/our-free-model/patch-guard.log`

### 手動重套
```powershell
node patch-assets\reapply-ofm-patches.mjs --pkg "%USERPROFILE%\dsh-our-free-model"
```

24 步、錨點式（不依賴行號）、冪等（重複跑安全）。

---

## 安裝方式

把本 repo 的內容覆蓋到插件目錄：

```
%USERPROFILE%\dsh-our-free-model\
```

然後在 DSH：設定 → Our Free Model → 插件升級 → 按「热重载插件」，再按 F5。

建議同時註冊守護者，避免下次升級又被覆蓋。

---

## 已知的上游問題（非本補丁造成）

`scripts/client-lint.mjs` 在 2.5.x 會失敗：原版 `client.js` 就 `require('react-dom')`，
但 lint 規則只允許 `react`。已用未補丁的原檔重現同樣錯誤。

---

## 授權

上游為 MIT，本補丁版沿用。原始版權屬 [Ebony-Vinyl/dsh-our-free-model](https://github.com/Ebony-Vinyl/dsh-our-free-model) 作者。