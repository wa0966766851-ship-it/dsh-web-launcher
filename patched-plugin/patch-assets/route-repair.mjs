/**
 * route-repair.mjs — 修復「isolated 路由被嵌進 /summary 區塊」的歷史遺留。
 *
 * 背景：早期補丁把 /channels/login/isolated 插在 `if (GET /summary) {` 之後，
 * 於是外層要求 GET、內層要求 POST，POST 永遠進不來（WorkBuddy 獨立登入失效）。
 *
 * ⚠️ 為什麼是逐行掃描而不是一條大正則：
 * 第一版用正則把 isolated 區塊抽出來再拼回去，結果吐出 `if (...) {` 貼在第 0 欄、
 * 外層的 } 也沒被吃掉，產生的 index.js 語法不合法（實測 2026-10-28 使用者回報
 * "Missing catch or finally after try"）。逐行掃描能保留縮排、精確吃掉多餘的 }。
 */

/**
 * @param {string} text index.js 全文
 * @returns {string|null} 修好的全文；null 表示結構已是正確的（或找不到錨點）
 */
export function repairNestedIsolatedRoute(text) {
  const L = text.split('\n')

  const sumIdx = L.findIndex(function (l) {
    return l.indexOf("routePath === '/summary'") >= 0 && l.indexOf("'GET'") >= 0
  })
  if (sumIdx < 0) return null

  // isolated 必須緊跟在 /summary 的開括號之後（中間若先出現 buildSummary 就是已正確）
  let isoIdx = -1
  for (let i = sumIdx + 1; i < Math.min(sumIdx + 4, L.length); i++) {
    if (L[i].indexOf("routePath === '/channels/login/isolated'") >= 0) { isoIdx = i; break }
    if (L[i].indexOf('buildSummary') >= 0) break
  }
  if (isoIdx < 0) return null

  // isolated 區塊 = 從 isoIdx 到與它配對的 }（同縮排或更淺）
  const isoIndent = (L[isoIdx].match(/^[ \t]*/) || [''])[0].length
  let isoEnd = -1
  for (let i = isoIdx + 1; i < L.length; i++) {
    const ind = (L[i].match(/^[ \t]*/) || [''])[0].length
    if (L[i].trim() === '}' && ind <= isoIndent) { isoEnd = i; break }
  }
  if (isoEnd < 0) return null

  const isoBlock = L.slice(isoIdx, isoEnd + 1)

  // /summary 的 return 行
  let retIdx = -1
  for (let i = isoEnd + 1; i < Math.min(isoEnd + 4, L.length); i++) {
    if (L[i].indexOf('buildSummary') >= 0) { retIdx = i; break }
  }
  if (retIdx < 0) return null

  const retIndent = (L[retIdx].match(/^[ \t]*/) || [''])[0]
  const sumIndent = (L[sumIdx].match(/^[ \t]*/) || [''])[0]

  // 重建：/summary { return } + isolated 區塊（縮排統一對齊 sumIndent）
  const rebuilt = [
    L[sumIdx],
    retIndent + 'return send(200, buildSummary(deps))',
    sumIndent + '}',
  ].concat(isoBlock.map(function (l, k) {
    if (l.trim() === '') return l
    // 第一行（isolated 的 if）對齊 sumIndent；其餘保留與第一行的相對縮排
    const rel = (l.match(/^[ \t]*/) || [''])[0].length - isoIndent
    const indent = sumIndent + (rel > 0 ? ' '.repeat(rel) : '')
    return indent + l.trim()
  }))

  // 吃掉原本那個多出來的 }（與 sumIndent 同縮排）
  let consumeTo = retIdx
  if (L[retIdx + 1] !== undefined && L[retIdx + 1].trim() === '}' &&
      (L[retIdx + 1].match(/^[ \t]*/) || [''])[0].length === sumIndent.length) {
    consumeTo = retIdx + 1
  }

  const out = L.slice(0, sumIdx).concat(rebuilt, L.slice(consumeTo + 1))
  return out.join('\n')
}