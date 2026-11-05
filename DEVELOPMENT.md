# 開發說明

輸入食品或健康食品的行銷文案，系統比對**臺北市政府衛生局的實際處罰案例**與《食品及相關產品標示宣傳廣告涉及不實誇張易生誤解或醫療效能認定準則》，標出可能違規的詞句、附上相似的處罰案例，並由 AI 給出修改建議。

> 本工具僅供刊登前自我檢查參考，不構成法律意見；實際認定以主管機關為準。

## 判斷流程

```
使用者文案
  ├─ 規則層：比對《認定準則》風險詞（醫療效能、改變生理外觀、誇大用語、引用公文字號）
  ├─ 案例層：與 344 件處罰案例的「被罰詞句」比對相似度
  ├─ 允許詞句：標出準則附件一通常可使用的詞句
  └─ AI 層：Claude（經 Vercel AI Gateway）依整體表現綜合判斷，逐句給理由、法條與改寫建議
```

規則層與案例層結果會先顯示，AI 判斷完成後再補上；AI 無法使用時仍可看到規則比對結果。

## 資料

- 來源：[臺北市政府衛生局「違規廣告」公告](https://health.gov.taipei/News.aspx?n=13A23138C06A3532&sms=8E7386D329C4B210)中的「食品、健康食品違規廣告處罰案件統計表」PDF
- 網站只保留約 12 個月，`scripts/fetch_taipei.py` 會合併既有的 `data/cases.json`，舊月份不會因為網站下架而消失
- GitHub Actions 每月 7 日自動執行並提交新資料，推上 GitHub 後 Vercel 會自動重新部署

手動更新：

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/fetch_taipei.py
```

## 開發

```bash
npm install
vercel link          # 連結 Vercel 專案
vercel env pull      # 取得 AI Gateway 的 OIDC 憑證
npm run dev
```

| 路徑 | 說明 |
|---|---|
| `scripts/fetch_taipei.py` | 抓取公告、解析 PDF、抽出被罰詞句 |
| `scripts/export_slides.py` | 把 `slides/src` 的簡報原始檔輸出成 PDF、PPTX（需要 Google Chrome） |
| `slides/` | 12 類違規廣告簡報：合輯 PDF、各類 PDF 與 PPTX、原始檔 |
| `data/cases.json` | 處罰案例資料 |
| `src/lib/regulations.ts` | 法條原文、附件一允許詞句、風險詞規則 |
| `src/lib/analyze.ts` | 規則比對與相似案例檢索 |
| `src/lib/judge.ts` | AI 判斷的提示詞與輸出格式 |
| `src/app/api/analyze` | 規則與案例比對 API（快） |
| `src/app/api/judge` | AI 綜合判斷 API（約 10～30 秒） |
| `src/app/cases` | 處罰案例庫瀏覽與搜尋 |

## AI 判斷的費用與設定

只有 `/api/judge`（AI 綜合判斷）會產生費用，其餘功能（規則比對、相似案例、案例庫、GitHub Actions 每月更新）都不需付費。

**計費方式**

- 透過 Vercel AI Gateway 呼叫 `anthropic/claude-sonnet-5.5`。部署在 Vercel 上用 OIDC 驗證，不需要另外設定 API key。
- 價格為原廠牌價，Vercel 不加價：輸入每百萬 token 2 美元，輸出每百萬 token 10 美元（2026-11 查詢）。
- 一次檢測估計輸入 4,000～6,000 token、輸出 1,000～2,000 token，約 0.02～0.03 美元，1,000 次約 20～30 美元。這是依提示詞長度推估，尚未實測。

**開通步驟**

1. 到 Vercel Dashboard → tmuh team → **AI Gateway**，綁定信用卡。
2. 依 Vercel 文件，免費額度只適用部分模型，Claude 很可能不在其中。綁卡後若 AI 判斷仍失敗，請購買 AI Gateway Credits（預付儲值）。
3. 開通後不需要改程式或重新部署。

**控制費用（建議都要設定）**

- **預算上限（budget）**：網站公開，任何人按「開始檢測」都會扣額度，務必設上限。
- **自動加值（auto top-up）**：預設關閉。保持關閉時，額度用完 AI 判斷會停止，不會自動扣卡；網站會改為只顯示規則比對結果（`/api/judge` 回傳 502，前端顯示「規則初判」）。
- **改用較便宜的模型**：修改 `src/lib/judge.ts` 的 `MODEL` 常數，例如換成 Claude Haiku。成本較低，但判斷品質可能下降。
- 目前只限制單次輸入 4,000 字，沒有頻率限制；被大量呼叫時可考慮加上 Vercel BotID 或 rate limit。

**其他服務**

- Vercel 託管：若 team 是 Hobby（免費）方案，目前用量不會產生費用，但 Hobby 僅限非商業用途。
- GitHub：公開 repo 的 Actions 免費。

## 後續規劃

- 納入衛福部食藥署食品專區內容（認定準則附件二、健康食品許可功效、全國違規廣告資料庫）
- 用最新月份案例當測試集，評估召回率與誤判率
