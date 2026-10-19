# Gemini OAuth 憑證（重要）

本 repo 的 `vendor/channel-pack/pack.js` 中，Gemini OAuth 的
**Client ID 與 Client Secret 已移除**，改為從環境變數讀取：

| 環境變數 | 用途 |
|---|---|
| `OFM_GEMINI_CLIENT_ID` | Google OAuth Client ID |
| `OFM_GEMINI_CLIENT_SECRET` | Google OAuth Client Secret |

原因：上游把這兩組憑證**硬編碼**在 `pack.js` 裡，GitHub 的
Push Protection 會直接拒絕推送（偵測為 Google OAuth Client Secret）。

## 影響

**免費車道完全不受影響**，只有「Gemini 帳號登入」這個流程需要這兩個值。

若你需要用 Gemini 頻道：

```powershell
# 設定後重啟 DSH
setx OFM_GEMINI_CLIENT_ID "你的 client id"
setx OFM_GEMINI_CLIENT_SECRET "你的 client secret"
```

若你不使用 Gemini 頻道，什麼都不用做。

## 想用上游原版

直接從上游安裝即可，那裡仍帶著原作者的憑證：
<https://github.com/Ebony-Vinyl/dsh-our-free-model>