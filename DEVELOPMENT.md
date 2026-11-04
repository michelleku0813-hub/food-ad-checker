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
| `data/cases.json` | 處罰案例資料 |
| `src/lib/regulations.ts` | 法條原文、附件一允許詞句、風險詞規則 |
| `src/lib/analyze.ts` | 規則比對與相似案例檢索 |
| `src/lib/judge.ts` | AI 判斷的提示詞與輸出格式 |
| `src/app/api/analyze` | 規則與案例比對 API（快） |
| `src/app/api/judge` | AI 綜合判斷 API（約 10～30 秒） |
| `src/app/cases` | 處罰案例庫瀏覽與搜尋 |

## 後續規劃

- 納入衛福部食藥署食品專區內容（認定準則附件二、健康食品許可功效、全國違規廣告資料庫）
- 用最新月份案例當測試集，評估召回率與誤判率
